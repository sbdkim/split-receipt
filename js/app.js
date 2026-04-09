(function () {
  "use strict";

  var STORAGE_KEYS = {
    currentBill: "receiptSplitter.currentBill",
    savedBills: "receiptSplitter.savedBills",
    preferences: "receiptSplitter.preferences"
  };

  function createId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 10);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createEmptyBill() {
    return {
      id: createId("bill"),
      title: "",
      currencySymbol: "$",
      subtotal: "",
      tax: "",
      tip: "",
      notes: "",
      reconciliationMode: "entered",
      diners: [],
      items: [],
      updatedAt: new Date().toISOString()
    };
  }

  function createDiner(name) {
    return {
      id: createId("diner"),
      name: name || ""
    };
  }

  function createItem() {
    return {
      id: createId("item"),
      name: "",
      unitPrice: "",
      quantity: "1",
      assignedDinerIds: []
    };
  }

  function normalizeBill(raw) {
    var bill = raw && typeof raw === "object" ? clone(raw) : createEmptyBill();
    var normalized = createEmptyBill();
    normalized.id = typeof bill.id === "string" ? bill.id : normalized.id;
    normalized.title = typeof bill.title === "string" ? bill.title : "";
    normalized.currencySymbol = typeof bill.currencySymbol === "string" && bill.currencySymbol.trim() ? bill.currencySymbol.slice(0, 3) : "$";
    normalized.subtotal = typeof bill.subtotal === "string" ? bill.subtotal : bill.subtotal == null ? "" : String(bill.subtotal);
    normalized.tax = typeof bill.tax === "string" ? bill.tax : bill.tax == null ? "" : String(bill.tax);
    normalized.tip = typeof bill.tip === "string" ? bill.tip : bill.tip == null ? "" : String(bill.tip);
    normalized.notes = typeof bill.notes === "string" ? bill.notes : "";
    normalized.reconciliationMode = bill.reconciliationMode === "items" ? "items" : "entered";
    normalized.updatedAt = typeof bill.updatedAt === "string" ? bill.updatedAt : new Date().toISOString();
    normalized.diners = Array.isArray(bill.diners) ? bill.diners.map(function (diner) {
      return {
        id: typeof diner.id === "string" ? diner.id : createId("diner"),
        name: typeof diner.name === "string" ? diner.name : ""
      };
    }) : [];
    normalized.items = Array.isArray(bill.items) ? bill.items.map(function (item) {
      return {
        id: typeof item.id === "string" ? item.id : createId("item"),
        name: typeof item.name === "string" ? item.name : "",
        unitPrice: typeof item.unitPrice === "string" ? item.unitPrice : item.unitPrice == null ? "" : String(item.unitPrice),
        quantity: typeof item.quantity === "string" ? item.quantity : item.quantity == null ? "1" : String(item.quantity),
        assignedDinerIds: Array.isArray(item.assignedDinerIds) ? item.assignedDinerIds.filter(function (value) {
          return typeof value === "string";
        }) : []
      };
    }) : [];
    return normalized;
  }

  function parseMoneyInput(value) {
    var text = value == null ? "" : String(value).trim();
    if (!text) {
      return { valid: true, empty: true, cents: 0 };
    }

    var normalized = text.replace(/[^0-9.-]/g, "");
    if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) {
      return { valid: false, empty: false, cents: 0 };
    }

    var numberValue = Number(normalized);
    if (!Number.isFinite(numberValue)) {
      return { valid: false, empty: false, cents: 0 };
    }

    return {
      valid: true,
      empty: false,
      cents: Math.round(numberValue * 100)
    };
  }

  function parseQuantityInput(value) {
    var text = value == null ? "" : String(value).trim();
    if (!/^\d+$/.test(text)) {
      return { valid: false, value: 0 };
    }

    var quantity = Number(text);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { valid: false, value: 0 };
    }

    return { valid: true, value: quantity };
  }

  function formatMoney(cents, currencySymbol) {
    var sign = cents < 0 ? "-" : "";
    return sign + currencySymbol + Math.abs(cents / 100).toFixed(2);
  }

  function centsToAmount(cents) {
    return (cents / 100).toFixed(2);
  }

  function splitEvenly(totalCents, ids) {
    var allocations = {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return allocations;
    }

    var base = Math.floor(totalCents / ids.length);
    var remainder = totalCents - base * ids.length;
    ids.forEach(function (id, index) {
      allocations[id] = base + (index < remainder ? 1 : 0);
    });
    return allocations;
  }

  function allocateByWeights(totalCents, entries) {
    var allocations = {};
    entries.forEach(function (entry) {
      allocations[entry.id] = 0;
    });

    if (!entries.length || totalCents === 0) {
      return allocations;
    }

    var totalWeight = entries.reduce(function (sum, entry) {
      return sum + Math.max(0, entry.weight);
    }, 0);
    if (totalWeight <= 0) {
      return allocations;
    }

    var remainder = totalCents;
    entries.forEach(function (entry) {
      var amount = Math.floor(totalCents * entry.weight / totalWeight);
      allocations[entry.id] = amount;
      remainder -= amount;
    });

    var ranked = entries.slice().sort(function (left, right) {
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }
      return left.order - right.order;
    });

    for (var index = 0; index < remainder; index += 1) {
      allocations[ranked[index % ranked.length].id] += 1;
    }

    return allocations;
  }

  function indexById(list) {
    var map = {};
    list.forEach(function (entry, index) {
      map[entry.id] = index;
    });
    return map;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createStorageWrapper(storageObject) {
    return {
      available: true,
      set: function (key, value) {
        storageObject.setItem(key, value);
      },
      get: function (key) {
        return storageObject.getItem(key);
      },
      remove: function (key) {
        storageObject.removeItem(key);
      }
    };
  }

  function resolveStorage() {
    try {
      if (!window.localStorage) {
        throw new Error("Storage unavailable");
      }
      var probeKey = "__split-receipt-probe__";
      window.localStorage.setItem(probeKey, "1");
      window.localStorage.removeItem(probeKey);
      return createStorageWrapper(window.localStorage);
    } catch (error) {
      return {
        available: false,
        memory: {},
        set: function (key, value) {
          this.memory[key] = value;
        },
        get: function (key) {
          return Object.prototype.hasOwnProperty.call(this.memory, key) ? this.memory[key] : null;
        },
        remove: function (key) {
          delete this.memory[key];
        }
      };
    }
  }

  function saveBillToStorage(storage, bill) {
    storage.set(STORAGE_KEYS.currentBill, JSON.stringify(normalizeBill(bill)));
  }

  function loadBillFromStorage(storage) {
    var raw = storage.get(STORAGE_KEYS.currentBill);
    if (!raw) {
      return createEmptyBill();
    }

    try {
      return normalizeBill(JSON.parse(raw));
    } catch (error) {
      return createEmptyBill();
    }
  }

  function clearBillFromStorage(storage) {
    storage.remove(STORAGE_KEYS.currentBill);
  }

  function computeBill(rawBill) {
    var bill = normalizeBill(rawBill);
    var currency = bill.currencySymbol || "$";
    var diners = bill.diners.slice();
    var dinerOrder = indexById(diners);
    var parsedSubtotal = parseMoneyInput(bill.subtotal);
    var parsedTax = parseMoneyInput(bill.tax);
    var parsedTip = parseMoneyInput(bill.tip);
    var fieldErrors = {
      subtotal: !parsedSubtotal.valid,
      tax: !parsedTax.valid,
      tip: !parsedTip.valid
    };
    var warnings = [];
    var itemErrors = {};
    var itemSubtotals = {};

    diners.forEach(function (diner) {
      itemSubtotals[diner.id] = 0;
    });

    var validItems = [];

    bill.items.forEach(function (item) {
      var errors = [];
      var price = parseMoneyInput(item.unitPrice);
      var quantity = parseQuantityInput(item.quantity);
      var assignedIds = item.assignedDinerIds.filter(function (id) {
        return Object.prototype.hasOwnProperty.call(dinerOrder, id);
      });

      if (!price.valid) {
        errors.push("Enter a valid item price.");
      } else if (price.empty) {
        errors.push("Enter an item price.");
      } else if (price.cents <= 0) {
        errors.push("Item price must be greater than zero.");
      }

      if (!quantity.valid) {
        errors.push("Quantity must be a whole number greater than zero.");
      }

      if (!assignedIds.length) {
        errors.push("Assign this item to at least one diner.");
      }

      if (errors.length) {
        itemErrors[item.id] = errors;
        return;
      }

      var lineTotal = price.cents * quantity.value;
      var split = splitEvenly(lineTotal, assignedIds.slice().sort(function (left, right) {
        return dinerOrder[left] - dinerOrder[right];
      }));

      Object.keys(split).forEach(function (dinerId) {
        itemSubtotals[dinerId] += split[dinerId];
      });

      validItems.push({
        id: item.id,
        totalCents: lineTotal,
        assignedDinerIds: assignedIds
      });
    });

    var itemSubtotalTotal = diners.reduce(function (sum, diner) {
      return sum + itemSubtotals[diner.id];
    }, 0);

    if (!diners.length) {
      warnings.push("Add at least one diner before assigning items or reviewing totals.");
    }
    if (bill.items.length && Object.keys(itemErrors).length) {
      warnings.push("Invalid item rows are excluded until their inputs are fixed.");
    }
    if (!parsedSubtotal.valid) {
      warnings.push("Subtotal must be a valid amount to finalize the bill.");
    }
    if (!parsedTax.valid) {
      warnings.push("Tax must be a valid amount.");
    }
    if (!parsedTip.valid) {
      warnings.push("Tip must be a valid amount.");
    }

    if (!parsedSubtotal.empty && parsedSubtotal.valid && parsedSubtotal.cents < 0) {
      warnings.push("Subtotal cannot be negative.");
    }
    if (!parsedTax.empty && parsedTax.valid && parsedTax.cents < 0) {
      warnings.push("Tax cannot be negative.");
    }
    if (!parsedTip.empty && parsedTip.valid && parsedTip.cents < 0) {
      warnings.push("Tip cannot be negative.");
    }

    var effectiveSubtotal = 0;
    var subtotalSourceLabel = "empty subtotal";

    if (bill.reconciliationMode === "items" && itemSubtotalTotal > 0) {
      effectiveSubtotal = itemSubtotalTotal;
      subtotalSourceLabel = "item subtotal";
    } else if (!parsedSubtotal.empty && parsedSubtotal.valid && parsedSubtotal.cents >= 0) {
      effectiveSubtotal = parsedSubtotal.cents;
      subtotalSourceLabel = "entered subtotal";
    } else if (itemSubtotalTotal > 0) {
      effectiveSubtotal = itemSubtotalTotal;
      subtotalSourceLabel = "item subtotal preview";
      warnings.push("Enter a bill subtotal to lock the final total. Until then, item totals are used as a preview.");
    }

    var reconciliationWarning = null;
    if (parsedSubtotal.valid && !parsedSubtotal.empty && itemSubtotalTotal > 0 && parsedSubtotal.cents !== itemSubtotalTotal) {
      reconciliationWarning = {
        enteredSubtotal: parsedSubtotal.cents,
        itemSubtotal: itemSubtotalTotal,
        difference: parsedSubtotal.cents - itemSubtotalTotal
      };
      warnings.push("Entered subtotal and assigned item totals do not match.");
    }

    var subtotalShares = {};
    diners.forEach(function (diner) {
      subtotalShares[diner.id] = 0;
    });

    if (itemSubtotalTotal > 0) {
      subtotalShares = allocateByWeights(effectiveSubtotal, diners.map(function (diner, index) {
        return {
          id: diner.id,
          weight: itemSubtotals[diner.id],
          order: index
        };
      }));
    } else if (effectiveSubtotal > 0 && diners.length) {
      warnings.push("Add assigned items before the app can split the subtotal fairly.");
    }

    var taxTotal = parsedTax.valid ? Math.max(0, parsedTax.cents) : 0;
    var tipTotal = parsedTip.valid ? Math.max(0, parsedTip.cents) : 0;
    var taxShares = allocateByWeights(taxTotal, diners.map(function (diner, index) {
      return {
        id: diner.id,
        weight: subtotalShares[diner.id],
        order: index
      };
    }));
    var tipShares = allocateByWeights(tipTotal, diners.map(function (diner, index) {
      return {
        id: diner.id,
        weight: subtotalShares[diner.id],
        order: index
      };
    }));

    var people = diners.map(function (diner) {
      var subtotal = subtotalShares[diner.id] || 0;
      var tax = taxShares[diner.id] || 0;
      var tip = tipShares[diner.id] || 0;
      return {
        id: diner.id,
        name: diner.name.trim() || "Unnamed diner",
        itemSubtotalCents: itemSubtotals[diner.id] || 0,
        subtotalShareCents: subtotal,
        taxShareCents: tax,
        tipShareCents: tip,
        totalCents: subtotal + tax + tip
      };
    });

    var totalOwed = people.reduce(function (sum, person) {
      return sum + person.totalCents;
    }, 0);

    return {
      bill: bill,
      currencySymbol: currency,
      fieldErrors: fieldErrors,
      itemErrors: itemErrors,
      warnings: warnings,
      reconciliationWarning: reconciliationWarning,
      subtotalSourceLabel: subtotalSourceLabel,
      effectiveSubtotalCents: effectiveSubtotal,
      enteredSubtotalCents: parsedSubtotal.valid ? Math.max(0, parsedSubtotal.cents) : 0,
      itemSubtotalCents: itemSubtotalTotal,
      taxCents: taxTotal,
      tipCents: tipTotal,
      grandTotalCents: effectiveSubtotal + taxTotal + tipTotal,
      totalOwedCents: totalOwed,
      people: people,
      readyToShare: diners.length > 0 && validItems.length > 0 && totalOwed === effectiveSubtotal + taxTotal + tipTotal
    };
  }

  function buildSummaryText(result) {
    var title = result.bill.title.trim() || "Receipt split";
    var lines = [
      title,
      "Grand total: " + formatMoney(result.grandTotalCents, result.currencySymbol),
      "Subtotal source: " + result.subtotalSourceLabel,
      ""
    ];

    if (!result.people.length) {
      lines.push("Add diners and assigned items to generate a summary.");
      return lines.join("\n");
    }

    result.people.forEach(function (person) {
      lines.push(person.name + ": " + formatMoney(person.totalCents, result.currencySymbol));
      lines.push("  Items: " + formatMoney(person.subtotalShareCents, result.currencySymbol));
      lines.push("  Tax: " + formatMoney(person.taxShareCents, result.currencySymbol));
      lines.push("  Tip: " + formatMoney(person.tipShareCents, result.currencySymbol));
    });

    return lines.join("\n");
  }

  function fieldMarkup(label, field, value, invalid, placeholder, type) {
    return '' +
      '<div class="field">' +
      '  <label for="' + escapeHtml(field) + '">' + escapeHtml(label) + '</label>' +
      '  <input id="' + escapeHtml(field) + '" type="' + escapeHtml(type) + '" data-focus-key="bill-' + escapeHtml(field) + '" data-bill-field="' + escapeHtml(field) + '" value="' + escapeHtml(value) + '" placeholder="' + escapeHtml(placeholder) + '" class="' + (invalid ? "invalid" : "") + '">' +
      '</div>';
  }

  function renderReconciliationDetail(result) {
    if (!result.reconciliationWarning) {
      return '<p class="footer-note">Assigned items currently total ' + escapeHtml(formatMoney(result.itemSubtotalCents, result.currencySymbol)) + '.</p>';
    }

    var warning = result.reconciliationWarning;
    return '<p class="footer-note">Entered subtotal: <strong>' + escapeHtml(formatMoney(warning.enteredSubtotal, result.currencySymbol)) + '</strong>. Assigned item total: <strong>' + escapeHtml(formatMoney(warning.itemSubtotal, result.currencySymbol)) + '</strong>. Difference: <strong>' + escapeHtml(formatMoney(warning.difference, result.currencySymbol)) + '</strong>.</p>';
  }

  function renderBillPanel(state, result) {
    return '' +
      '<section class="panel">' +
      '  <div class="panel-header">' +
      '    <div>' +
      '      <h2>Bill setup</h2>' +
      '      <p>Set the bill total, tax, and tip. The app keeps all calculations in cents so totals reconcile exactly.</p>' +
      '    </div>' +
      '  </div>' +
      '  <div class="panel-body">' +
      '    <div class="split-grid">' +
      fieldMarkup("Bill name", "title", state.title, false, "e.g. Friday dinner", "text") +
      fieldMarkup("Currency symbol", "currencySymbol", state.currencySymbol, false, "$", "text") +
      fieldMarkup("Subtotal", "subtotal", state.subtotal, result.fieldErrors.subtotal, "0.00", "text") +
      fieldMarkup("Tax", "tax", state.tax, result.fieldErrors.tax, "0.00", "text") +
      fieldMarkup("Tip", "tip", state.tip, result.fieldErrors.tip, "0.00", "text") +
      '</div>' +
      '<div class="field" style="margin-top: 14px;">' +
      '  <label for="notes">Notes</label>' +
      '  <textarea id="notes" data-focus-key="bill-notes" data-bill-field="notes" placeholder="Optional details about the meal or payment.">' + escapeHtml(state.notes) + '</textarea>' +
      '</div>' +
      '<div class="reconciliation">' +
      '  <h3>Subtotal source</h3>' +
      '  <p>The current split is using the <strong>' + escapeHtml(result.subtotalSourceLabel) + '</strong>. Switch modes if the assigned items and bill subtotal differ.</p>' +
      '  <div class="segmented">' +
      '    <button type="button" class="button-secondary ' + (state.reconciliationMode === "entered" ? "is-active" : "") + '" data-action="set-reconciliation-mode" data-mode="entered">Use entered subtotal</button>' +
      '    <button type="button" class="button-secondary ' + (state.reconciliationMode === "items" ? "is-active" : "") + '" data-action="set-reconciliation-mode" data-mode="items">Match subtotal to items</button>' +
      '  </div>' +
      renderReconciliationDetail(result) +
      '</div>' +
      '  </div>' +
      '</section>';
  }

  function renderDinersPanel(state) {
    var rows = state.diners.length ? state.diners.map(function (diner) {
      return '' +
        '<div class="diner-row">' +
        '  <div class="field">' +
        '    <label for="diner-' + escapeHtml(diner.id) + '">Diner name</label>' +
        '    <input id="diner-' + escapeHtml(diner.id) + '" type="text" data-focus-key="diner-' + escapeHtml(diner.id) + '" data-diner-id="' + escapeHtml(diner.id) + '" data-diner-field="name" value="' + escapeHtml(diner.name) + '" placeholder="e.g. Alex">' +
        '  </div>' +
        '  <div class="button-row"><button type="button" class="button-ghost" data-action="remove-diner" data-diner-id="' + escapeHtml(diner.id) + '">Remove</button></div>' +
        '</div>';
    }).join("") : '<div class="empty-state"><p class="empty-title">No diners yet</p><p class="empty-copy">Add diners first so each item can be assigned to the right people.</p></div>';

    return '' +
      '<section class="panel">' +
      '  <div class="panel-header">' +
      '    <div>' +
      '      <h2>Diners</h2>' +
      '      <p>Each person gets a running subtotal, tax share, tip share, and final amount owed.</p>' +
      '    </div>' +
      '    <button type="button" class="button" data-action="add-diner">Add diner</button>' +
      '  </div>' +
      '  <div class="panel-body"><div class="list">' + rows + '</div></div>' +
      '</section>';
  }

  function renderAssignmentChips(state, item) {
    if (!state.diners.length) {
      return '<div class="empty-state"><p class="empty-title">Assign diners first</p><p class="empty-copy">Add diners to unlock item assignment.</p></div>';
    }

    return '<div class="check-grid">' + state.diners.map(function (diner) {
      var checked = item.assignedDinerIds.indexOf(diner.id) >= 0;
      return '' +
        '<label class="check-chip">' +
        '  <input type="checkbox" data-item-id="' + escapeHtml(item.id) + '" data-diner-toggle="' + escapeHtml(diner.id) + '" ' + (checked ? "checked" : "") + '>' +
        '  <span>' + escapeHtml(diner.name.trim() || "Unnamed diner") + '</span>' +
        '</label>';
    }).join("") + '</div>';
  }

  function renderItemsPanel(state, result) {
    var cards = state.items.length ? state.items.map(function (item) {
      var errors = result.itemErrors[item.id] || [];
      var assigned = item.assignedDinerIds.length ? item.assignedDinerIds.map(function (dinerId) {
        var diner = state.diners.find(function (entry) {
          return entry.id === dinerId;
        });
        return diner ? diner.name.trim() || "Unnamed diner" : null;
      }).filter(Boolean).join(", ") : "No diners assigned";

      return '' +
        '<div class="item-card">' +
        '  <div class="item-top">' +
        '    <div class="field">' +
        '      <label for="item-name-' + escapeHtml(item.id) + '">Item</label>' +
        '      <input id="item-name-' + escapeHtml(item.id) + '" type="text" data-focus-key="item-name-' + escapeHtml(item.id) + '" data-item-id="' + escapeHtml(item.id) + '" data-item-field="name" value="' + escapeHtml(item.name) + '" placeholder="e.g. Pasta">' +
        '    </div>' +
        '    <div class="field">' +
        '      <label for="item-price-' + escapeHtml(item.id) + '">Price</label>' +
        '      <input id="item-price-' + escapeHtml(item.id) + '" type="text" data-focus-key="item-price-' + escapeHtml(item.id) + '" data-item-id="' + escapeHtml(item.id) + '" data-item-field="unitPrice" value="' + escapeHtml(item.unitPrice) + '" placeholder="0.00" class="' + (errors.length ? "invalid" : "") + '">' +
        '    </div>' +
        '    <div class="field">' +
        '      <label for="item-quantity-' + escapeHtml(item.id) + '">Qty</label>' +
        '      <input id="item-quantity-' + escapeHtml(item.id) + '" type="text" data-focus-key="item-quantity-' + escapeHtml(item.id) + '" data-item-id="' + escapeHtml(item.id) + '" data-item-field="quantity" value="' + escapeHtml(item.quantity) + '" placeholder="1" class="' + (errors.length ? "invalid" : "") + '">' +
        '    </div>' +
        '    <div class="button-row"><button type="button" class="button-ghost" data-action="remove-item" data-item-id="' + escapeHtml(item.id) + '">Remove</button></div>' +
        '  </div>' +
        '  <div class="item-assignments">' +
        '    <div class="field"><label>Assign to</label>' + renderAssignmentChips(state, item) + '</div>' +
        '  </div>' +
        '  <div class="item-meta">' +
        '    <div>Assigned: ' + escapeHtml(assigned) + '</div>' +
        '    <div>' + (errors.length ? '<span class="error-text">' + escapeHtml(errors.join(" ")) + '</span>' : '<span class="status-inline">Shared items split evenly before tax and tip.</span>') + '</div>' +
        '  </div>' +
        '</div>';
    }).join("") : '<div class="empty-state"><p class="empty-title">No items yet</p><p class="empty-copy">Add items and assign them to diners. Shared items can be checked for multiple people.</p></div>';

    return '' +
      '<section class="panel">' +
      '  <div class="panel-header">' +
      '    <div>' +
      '      <h2>Items</h2>' +
      '      <p>Each line item can belong to one diner or several diners. Shared items split evenly before the proportional add-ons.</p>' +
      '    </div>' +
      '    <button type="button" class="button" data-action="add-item">Add item</button>' +
      '  </div>' +
      '  <div class="panel-body"><div class="list">' + cards + '</div></div>' +
      '</section>';
  }

  function renderSummaryPanel(result, summaryText) {
    var rows = result.people.length ? result.people.map(function (person) {
      return '' +
        '<tr>' +
        '  <td>' + escapeHtml(person.name) + '<div class="person-breakdown">Assigned items ' + escapeHtml(formatMoney(person.itemSubtotalCents, result.currencySymbol)) + '</div></td>' +
        '  <td>' + escapeHtml(formatMoney(person.subtotalShareCents, result.currencySymbol)) + '</td>' +
        '  <td>' + escapeHtml(formatMoney(person.taxShareCents, result.currencySymbol)) + '</td>' +
        '  <td>' + escapeHtml(formatMoney(person.tipShareCents, result.currencySymbol)) + '</td>' +
        '  <td>' + escapeHtml(formatMoney(person.totalCents, result.currencySymbol)) + '</td>' +
        '</tr>';
    }).join("") : '<tr><td colspan="5">Add diners and assigned items to see the split.</td></tr>';

    return '' +
      '<section class="panel">' +
      '  <div class="panel-header">' +
      '    <div>' +
      '      <h2>Split summary</h2>' +
      '      <p>Totals are calculated in real time and rounded so the overall amount always matches the chosen bill total.</p>' +
      '    </div>' +
      '  </div>' +
      '  <div class="panel-body">' +
      '    <table class="summary-table">' +
      '      <thead><tr><th>Diner</th><th>Items</th><th>Tax</th><th>Tip</th><th>Total</th></tr></thead>' +
      '      <tbody>' + rows + '</tbody>' +
      '    </table>' +
      '    <div class="totals-strip">' +
      '      <div class="metric"><span>Subtotal in use</span><strong>' + escapeHtml(formatMoney(result.effectiveSubtotalCents, result.currencySymbol)) + '</strong></div>' +
      '      <div class="metric"><span>Grand total</span><strong>' + escapeHtml(formatMoney(result.grandTotalCents, result.currencySymbol)) + '</strong></div>' +
      '      <div class="metric"><span>Assigned item total</span><strong>' + escapeHtml(formatMoney(result.itemSubtotalCents, result.currencySymbol)) + '</strong></div>' +
      '      <div class="metric"><span>Total allocated</span><strong>' + escapeHtml(formatMoney(result.totalOwedCents, result.currencySymbol)) + '</strong></div>' +
      '    </div>' +
      '    <textarea class="summary-output" readonly data-summary-output="true">' + escapeHtml(summaryText) + '</textarea>' +
      '    <div class="button-row" style="margin-top: 12px;">' +
      '      <button type="button" class="button-secondary" data-action="copy-summary">Copy summary</button>' +
      '      <button type="button" class="button-ghost" data-action="select-summary">Select text</button>' +
      '    </div>' +
      '    <p class="footer-note">Tip and tax are allocated proportionally to each diner&apos;s subtotal share. Blank tax or tip values count as zero.</p>' +
      '  </div>' +
      '</section>';
  }

  function ReceiptSplitterUi(container, options) {
    this.container = container;
    this.storage = options && options.storage ? options.storage : resolveStorage();
    this.state = loadBillFromStorage(this.storage);
    this.message = null;
    this.lastFocus = null;
    this.bindEvents();
    this.render();
  }

  ReceiptSplitterUi.prototype.bindEvents = function () {
    this.container.addEventListener("input", this.onInput.bind(this));
    this.container.addEventListener("change", this.onChange.bind(this));
    this.container.addEventListener("click", this.onClick.bind(this));
  };

  ReceiptSplitterUi.prototype.save = function () {
    this.state.updatedAt = new Date().toISOString();
    saveBillToStorage(this.storage, this.state);
  };

  ReceiptSplitterUi.prototype.setMessage = function (kind, text) {
    this.message = { kind: kind, text: text };
  };

  ReceiptSplitterUi.prototype.clearMessage = function () {
    this.message = null;
  };

  ReceiptSplitterUi.prototype.rememberFocus = function () {
    var activeElement = document.activeElement;
    if (!activeElement || !this.container.contains(activeElement)) {
      this.lastFocus = null;
      return;
    }
    this.lastFocus = {
      key: activeElement.getAttribute("data-focus-key"),
      start: typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null,
      end: typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null
    };
  };

  ReceiptSplitterUi.prototype.restoreFocus = function () {
    if (!this.lastFocus || !this.lastFocus.key) {
      return;
    }
    var target = this.container.querySelector('[data-focus-key="' + this.lastFocus.key + '"]');
    if (!target) {
      return;
    }
    target.focus();
    if (this.lastFocus.start != null && typeof target.setSelectionRange === "function") {
      target.setSelectionRange(this.lastFocus.start, this.lastFocus.end);
    }
  };

  ReceiptSplitterUi.prototype.render = function () {
    this.rememberFocus();
    var result = computeBill(this.state);
    var summaryText = buildSummaryText(result);
    var messageMarkup = this.message ? '<div class="notice ' + escapeHtml(this.message.kind) + '">' + escapeHtml(this.message.text) + '</div>' : "";
    var storageMarkup = '<div class="notice ' + (this.storage.available ? "" : "error") + '">' + escapeHtml(this.storage.available ? "Saved to this browser automatically." : "Storage is unavailable. Changes will last only for this session.") + '</div>';
    var warningMarkup = result.warnings.length ? '<div class="notice error">' + result.warnings.map(escapeHtml).join("<br>") + '</div>' : "";

    this.container.innerHTML = '' +
      '<div class="app-shell">' +
      '  <div class="hero-panel">' +
      '    <div>' +
      '      <p class="eyebrow">Northline</p>' +
      '      <h1>Split Receipt</h1>' +
      '      <p class="hero-copy">Assign each line item, split tax and tip proportionally, and keep the full bill workflow local to this browser.</p>' +
      '    </div>' +
      '    <div class="hero-note">' +
      '      <p class="hero-note-label">Local-first</p>' +
      '      <strong>Cent-safe split summary</strong>' +
      '      <p>Keep the whole bill in this browser and copy a clean payout summary when the split is ready.</p>' +
      '    </div>' +
      '  </div>' +
      messageMarkup +
      storageMarkup +
      warningMarkup +
      '  <div class="layout">' +
      '    <div class="stack">' +
      renderBillPanel(this.state, result) +
      renderDinersPanel(this.state) +
      renderItemsPanel(this.state, result) +
      '    </div>' +
      '    <div class="stack">' +
      renderSummaryPanel(result, summaryText) +
      '    </div>' +
      '  </div>' +
      '  <div class="sticky-total">' +
      '    <div><span>Current grand total</span><strong>' + escapeHtml(formatMoney(result.grandTotalCents, result.currencySymbol)) + '</strong></div>' +
      '    <button type="button" class="button-secondary" data-action="copy-summary">Copy summary</button>' +
      '  </div>' +
      '  <footer class="page-footer">' +
      '    <p>Northline receipt workflow</p>' +
      '    <p>All calculations stay in this browser and save locally on this device.</p>' +
      '  </footer>' +
      '</div>';
    this.restoreFocus();
  };

  ReceiptSplitterUi.prototype.onInput = function (event) {
    var billField = event.target.getAttribute("data-bill-field");
    var dinerField = event.target.getAttribute("data-diner-field");
    var itemField = event.target.getAttribute("data-item-field");
    var item;
    var diner;

    if (billField) {
      this.state[billField] = event.target.value;
      this.clearMessage();
      this.save();
      this.render();
      return;
    }

    if (dinerField) {
      diner = this.state.diners.find(function (entry) {
        return entry.id === event.target.getAttribute("data-diner-id");
      });
      if (diner) {
        diner[dinerField] = event.target.value;
        this.clearMessage();
        this.save();
        this.render();
      }
      return;
    }

    if (itemField) {
      item = this.state.items.find(function (entry) {
        return entry.id === event.target.getAttribute("data-item-id");
      });
      if (item) {
        item[itemField] = event.target.value;
        this.clearMessage();
        this.save();
        this.render();
      }
    }
  };

  ReceiptSplitterUi.prototype.onChange = function (event) {
    var toggleId = event.target.getAttribute("data-diner-toggle");
    if (!toggleId) {
      return;
    }

    var item = this.state.items.find(function (entry) {
      return entry.id === event.target.getAttribute("data-item-id");
    });
    if (!item) {
      return;
    }

    if (event.target.checked) {
      if (item.assignedDinerIds.indexOf(toggleId) === -1) {
        item.assignedDinerIds.push(toggleId);
      }
    } else {
      item.assignedDinerIds = item.assignedDinerIds.filter(function (id) {
        return id !== toggleId;
      });
    }

    this.clearMessage();
    this.save();
    this.render();
  };

  ReceiptSplitterUi.prototype.onClick = function (event) {
    var actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    var action = actionTarget.getAttribute("data-action");

    if (action === "add-diner") {
      this.state.diners.push(createDiner(""));
    } else if (action === "remove-diner") {
      var dinerId = actionTarget.getAttribute("data-diner-id");
      this.state.diners = this.state.diners.filter(function (diner) {
        return diner.id !== dinerId;
      });
      this.state.items.forEach(function (item) {
        item.assignedDinerIds = item.assignedDinerIds.filter(function (id) {
          return id !== dinerId;
        });
      });
    } else if (action === "add-item") {
      this.state.items.push(createItem());
    } else if (action === "remove-item") {
      var itemId = actionTarget.getAttribute("data-item-id");
      this.state.items = this.state.items.filter(function (item) {
        return item.id !== itemId;
      });
    } else if (action === "set-reconciliation-mode") {
      this.state.reconciliationMode = actionTarget.getAttribute("data-mode") === "items" ? "items" : "entered";
    } else if (action === "copy-summary") {
      this.handleCopySummary();
      return;
    } else if (action === "select-summary") {
      var output = this.container.querySelector("[data-summary-output='true']");
      if (output) {
        output.focus();
        output.select();
        this.setMessage("success", "Summary text selected.");
        this.render();
      }
      return;
    } else if (action === "reset") {
      if (window.confirm("Clear the current bill and start over?")) {
        this.state = createEmptyBill();
        clearBillFromStorage(this.storage);
        this.setMessage("success", "Bill reset. You can start a new split now.");
        this.render();
      }
      return;
    }

    this.clearMessage();
    this.save();
    this.render();
  };

  ReceiptSplitterUi.prototype.handleCopySummary = function () {
    var summaryText = buildSummaryText(computeBill(this.state));
    var self = this;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(summaryText).then(function () {
        self.setMessage("success", "Summary copied to the clipboard.");
        self.render();
      }).catch(function () {
        self.setMessage("error", "Clipboard copy failed. Use Select text instead.");
        self.render();
      });
      return;
    }

    self.setMessage("error", "Clipboard access is unavailable. Use Select text instead.");
    self.render();
  };

  function initReceiptSplitter(options) {
    var container = document.getElementById(options && options.containerId ? options.containerId : "app");
    if (!container) {
      throw new Error("App container not found.");
    }
    return new ReceiptSplitterUi(container, options || {});
  }

  var exported = {
    STORAGE_KEYS: STORAGE_KEYS,
    createEmptyBill: createEmptyBill,
    createDiner: createDiner,
    createItem: createItem,
    normalizeBill: normalizeBill,
    parseMoneyInput: parseMoneyInput,
    parseQuantityInput: parseQuantityInput,
    splitEvenly: splitEvenly,
    allocateByWeights: allocateByWeights,
    computeBill: computeBill,
    buildSummaryText: buildSummaryText,
    createStorageWrapper: createStorageWrapper,
    saveBillToStorage: saveBillToStorage,
    loadBillFromStorage: loadBillFromStorage,
    clearBillFromStorage: clearBillFromStorage,
    centsToAmount: centsToAmount,
    formatMoney: formatMoney,
    initReceiptSplitter: initReceiptSplitter
  };

  window.ReceiptSplitterApp = exported;

  if (document.getElementById("app")) {
    initReceiptSplitter();
  }
})();
