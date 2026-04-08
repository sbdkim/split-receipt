(function () {
  var STORAGE_KEY = "northline-theme";
  var root = document.documentElement;
  var media = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');
  var themeColors = {
    light: "#f6f3ee",
    dark: "#0f0f0f",
  };

  function getStoredTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function getPreferredTheme() {
    return "light";
  }

  function updateThemeColor(theme) {
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", themeColors[theme]);
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    if (document.body) {
      document.body.dataset.theme = theme;
    }
    updateThemeColor(theme);

    var toggle = document.getElementById("themeToggle");
    if (!toggle) {
      return;
    }

    var icon = toggle.querySelector(".theme-toggle__icon");
    var label = toggle.querySelector(".theme-toggle__label");
    var nextTheme = theme === "dark" ? "light" : "dark";

    toggle.setAttribute("aria-label", "Switch to " + nextTheme + " mode");
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");

    if (icon) {
      icon.textContent = theme === "dark" ? "☀" : "☾";
    }

    if (label) {
      label.textContent = "Switch to " + nextTheme + " mode";
    }
  }

  function persistTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures and keep the current session theme only.
    }
  }

  function clearPersistedTheme() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }

  function mountToggle() {
    if (!document.body || document.getElementById("themeToggle")) {
      return;
    }

    var button = document.createElement("button");
    button.type = "button";
    button.id = "themeToggle";
    button.className = "theme-toggle";
    button.innerHTML =
      '<span class="theme-toggle__icon" aria-hidden="true"></span>' +
      '<span class="theme-toggle__label"></span>';

    button.addEventListener("click", function () {
      var storedTheme = getStoredTheme();
      var currentTheme = root.dataset.theme || getPreferredTheme();
      var nextTheme = currentTheme === "dark" ? "light" : "dark";

      if (storedTheme === nextTheme) {
        clearPersistedTheme();
        applyTheme(getPreferredTheme());
        return;
      }

      persistTheme(nextTheme);
      applyTheme(nextTheme);
    });

    document.body.appendChild(button);
    applyTheme(root.dataset.theme || getPreferredTheme());
  }

  applyTheme(getStoredTheme() || getPreferredTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle, { once: true });
  } else {
    mountToggle();
  }

  if (media) {
    var handleChange = function () {
      if (!getStoredTheme()) {
        applyTheme(getPreferredTheme());
      }
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(handleChange);
    }
  }
})();
