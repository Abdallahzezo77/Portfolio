"use strict";

/* ==========================================================================
   a11y.js — accessibility panel
   --------------------------------------------------------------------------
   • The floating button opens a panel of settings (markup in index.html).
   • Each setting becomes a class or data-* attribute on <html>;
     assets/css/a11y.css turns those into the visual changes.
   • "Read aloud" and "Voice commands" use the browser's built-in speech
     (Web Speech API). If a browser can't do it, the panel says so.
   • Choices are remembered on this device (localStorage).
   ========================================================================== */

(function accessibilityPanel() {
  const STORAGE_KEY = "portfolio-a11y";

  /** Settings with levels: key -> number of levels (tapping cycles through them, then off). */
  const LEVELS = {
    contrast: 2,
    saturation: 3,
    "text-size": 4,
    "line-height": 3,
    "letter-spacing": 3,
    "word-spacing": 3,
    "text-align": 3,
  };

  /** On/off settings. */
  const TOGGLES = ["links", "headings", "hide-images", "pause", "cursor", "font", "tts", "voice", "tooltips"];

  /** Words read by screen readers for the state of each tile. */
  const STATE_WORDS = {
    en: { off: "Off", on: "On", level: (level, count) => `Level ${level} of ${count}` },
    ar: { off: "متوقف", on: "مفعّل", level: (level, count) => `المستوى ${level} من ${count}` },
  };

  /** Voice commands (English + Arabic) -> action. */
  const VOICE_COMMANDS = [
    { words: ["about", "نبذة", "عني"], run: () => goToPage("about") },
    { words: ["resume", "experience", "السيرة", "الخبرة"], run: () => goToPage("resume") },
    { words: ["portfolio", "projects", "work", "الأعمال", "المشاريع"], run: () => goToPage("portfolio") },
    { words: ["contact", "تواصل", "اتصال"], run: () => goToPage("contact") },
    { words: ["scroll down", "down", "انزل", "أسفل"], run: () => window.scrollBy({ top: window.innerHeight * 0.8 }) },
    { words: ["scroll up", "up", "اطلع", "أعلى"], run: () => window.scrollBy({ top: -window.innerHeight * 0.8 }) },
    { words: ["top", "البداية"], run: () => window.scrollTo({ top: 0 }) },
    { words: ["stop", "توقف", "إيقاف"], run: () => setToggle("voice", false) },
  ];

  /* ------------------------------------------------------------- elements */

  const html = document.documentElement;
  const widget = document.querySelector("[data-a11y-root]");
  if (!widget) return;

  const $ = (selector) => widget.querySelector(selector);
  const openButton = $("[data-a11y-open]");
  const panel = $("#a11y-panel");
  const closeButton = $("[data-a11y-close]");
  const languageSelect = $("[data-a11y-lang]");
  const enlargeSwitch = $("[data-a11y-enlarge]");
  const resetButton = $("[data-a11y-reset]");
  const tooltip = $("#a11y-tooltip");
  const voiceStatus = $("[data-a11y-voice-status]");
  const unsupportedNote = $("[data-a11y-unsupported]");
  const tiles = Array.from(widget.querySelectorAll("[data-a11y-setting]"));

  /* --------------------------------------------------------------- state */

  const defaults = () => ({
    lang: (navigator.language || "en").toLowerCase().startsWith("ar") ? "ar" : "en",
    large: false,
    levels: {},
    toggles: {},
  });

  let settings = load();

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) return { ...defaults(), ...saved };
    } catch {
      /* storage blocked */
    }
    // first visit: follow the system "reduce motion" setting
    const fresh = defaults();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) fresh.toggles.pause = true;
    return fresh;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* storage blocked: settings last for this visit only */
    }
  }

  /* --------------------------------------------------------- apply to page */

  function applyAll() {
    Object.keys(LEVELS).forEach((key) => {
      const level = settings.levels[key] || 0;
      if (level) html.setAttribute(`data-a11y-${key}`, level);
      else html.removeAttribute(`data-a11y-${key}`);
    });

    TOGGLES.forEach((key) => html.classList.toggle(`a11y-${key}`, Boolean(settings.toggles[key])));

    setParticlesMoving(!settings.toggles.pause);
    if (!settings.toggles.tts) stopSpeaking();
    if (settings.toggles.voice) startVoice();
    else stopVoice();
    if (!settings.toggles.tooltips) hideTooltip();

    applyLanguage();
    panel.classList.toggle("is-large", Boolean(settings.large));
    enlargeSwitch.checked = Boolean(settings.large);
    updateTiles();
  }

  /** Panel language (English / Arabic) and direction. */
  function applyLanguage() {
    widget.dataset.lang = settings.lang;
    panel.lang = settings.lang;
    panel.dir = settings.lang === "ar" ? "rtl" : "ltr";
    languageSelect.value = settings.lang;
  }

  /** Pressed state, level dots and screen-reader state for every tile. */
  function updateTiles() {
    const words = STATE_WORDS[settings.lang];
    tiles.forEach((tile) => {
      const key = tile.dataset.a11ySetting;
      const count = LEVELS[key];
      const level = count ? settings.levels[key] || 0 : settings.toggles[key] ? 1 : 0;

      tile.setAttribute("aria-pressed", String(level > 0));
      tile.querySelectorAll(".a11y-dots i").forEach((dot, index) => dot.classList.toggle("on", index < level));

      let state = words.off;
      if (level) state = count ? words.level(level, count) : words.on;
      tile.querySelector("[data-a11y-state]").textContent = `, ${state}`;
    });
  }

  /* ------------------------------------------------------------- particles */

  /** Stop / restart the moving background (particles.js). */
  function setParticlesMoving(moving) {
    (window.pJSDom || []).forEach((instance) => {
      if (instance && instance.pJS) instance.pJS.particles.move.enable = moving;
    });
  }

  /* ------------------------------------------------------------ read aloud */

  const synth = window.speechSynthesis;
  let readingElement = null;

  /** Elements that can be read when clicked or focused. */
  const READABLE = "p, h1, h2, h3, h4, h5, h6, li, address, a, button, time, data, label";

  function speak(text, element) {
    if (!synth || !text.trim()) return;
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = /[؀-ۿ]/.test(text) ? "ar-SA" : "en-US";
    readingElement = element;
    readingElement?.classList.add("a11y-reading");
    utterance.onend = utterance.onerror = () => readingElement?.classList.remove("a11y-reading");
    synth.speak(utterance);
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
    readingElement?.classList.remove("a11y-reading");
    readingElement = null;
  }

  /** Text a screen reader would use for an element. */
  function accessibleText(element) {
    return element.getAttribute("aria-label") || element.innerText || element.getAttribute("title") || element.getAttribute("alt") || "";
  }

  function readTarget(event) {
    if (!settings.toggles.tts || widget.contains(event.target)) return;
    if (event.type === "focusin" && !event.target.matches(":focus-visible")) return;
    const element = event.target.closest(READABLE);
    if (element) speak(accessibleText(element), element);
  }

  document.addEventListener("click", readTarget);
  document.addEventListener("focusin", readTarget);

  /* -------------------------------------------------------- voice commands */

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;

  function startVoice() {
    if (!Recognition || recognizer) return;
    recognizer = new Recognition();
    recognizer.lang = settings.lang === "ar" ? "ar-SA" : "en-US";
    recognizer.continuous = true;
    recognizer.interimResults = false;

    recognizer.onresult = (event) => {
      const said = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
      const command = VOICE_COMMANDS.find((cmd) => cmd.words.some((word) => said.includes(word)));
      if (command) command.run();
    };

    // keep listening until the user switches it off
    recognizer.onend = () => {
      if (settings.toggles.voice && recognizer) {
        try {
          recognizer.start();
        } catch {
          /* already started */
        }
      }
    };

    recognizer.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setToggle("voice", false); // microphone blocked
      }
    };

    try {
      recognizer.start();
      voiceStatus.hidden = false;
    } catch {
      /* already started */
    }
  }

  function stopVoice() {
    voiceStatus.hidden = true;
    if (!recognizer) return;
    const old = recognizer;
    recognizer = null;
    old.onend = null;
    old.abort();
  }

  /** Click the navbar button for a page (About / Resume / Portfolio / Contact). */
  function goToPage(page) {
    const button = Array.from(document.querySelectorAll("[data-nav-link]"))
      .find((link) => link.textContent.trim().toLowerCase() === page);
    if (button) button.click();
  }

  /* ----------------------------------------------------------- text hints */

  /** Shows the name of icons, images and links in a floating hint. */
  function showTooltip(event) {
    if (!settings.toggles.tooltips || widget.contains(event.target)) return;
    const element = event.target.closest("[title], [aria-label], img[alt]:not([alt='']), .social-link, .project-item a");
    if (!element) return hideTooltip();

    const text = element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("alt") ||
      element.querySelector(".sr-only")?.textContent || element.innerText;
    if (!text || !text.trim()) return hideTooltip();

    tooltip.textContent = text.trim();
    tooltip.hidden = false;
    const box = element.getBoundingClientRect();
    const left = Math.min(Math.max(8, box.left), window.innerWidth - tooltip.offsetWidth - 8);
    const below = box.bottom + 8 + tooltip.offsetHeight < window.innerHeight;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${below ? box.bottom + 8 : box.top - tooltip.offsetHeight - 8}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  document.addEventListener("mouseover", showTooltip);
  document.addEventListener("focusin", showTooltip);
  document.addEventListener("scroll", hideTooltip, { passive: true });

  /* ------------------------------------------------------------ the panel */

  function openPanel() {
    panel.hidden = false;
    openButton.setAttribute("aria-expanded", "true");
    enlargeSwitch.focus();
  }

  function closePanel({ returnFocus = true } = {}) {
    if (panel.hidden) return;
    panel.hidden = true;
    openButton.setAttribute("aria-expanded", "false");
    if (returnFocus) openButton.focus();
  }

  openButton.addEventListener("click", () => (panel.hidden ? openPanel() : closePanel()));
  closeButton.addEventListener("click", () => closePanel());

  // Escape closes the panel
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) closePanel();
  });

  // clicking outside the panel closes it
  document.addEventListener("pointerdown", (event) => {
    if (!panel.hidden && !widget.contains(event.target)) closePanel({ returnFocus: false });
  });

  /** Turn an on/off setting on or off (with support checks for speech). */
  function setToggle(key, on) {
    unsupportedNote.hidden = true;
    if (on && key === "tts" && !synth) return (unsupportedNote.hidden = false);
    if (on && key === "voice" && !Recognition) return (unsupportedNote.hidden = false);
    settings.toggles[key] = on;
    applyAll();
    save();
  }

  tiles.forEach((tile) =>
    tile.addEventListener("click", () => {
      const key = tile.dataset.a11ySetting;
      if (LEVELS[key]) {
        settings.levels[key] = ((settings.levels[key] || 0) + 1) % (LEVELS[key] + 1);
        applyAll();
        save();
      } else {
        setToggle(key, !settings.toggles[key]);
      }
    }));

  languageSelect.addEventListener("change", () => {
    settings.lang = languageSelect.value;
    if (recognizer) {
      stopVoice(); // restart listening in the new language
    }
    applyAll();
    save();
  });

  enlargeSwitch.addEventListener("change", () => {
    settings.large = enlargeSwitch.checked;
    applyAll();
    save();
  });

  resetButton.addEventListener("click", () => {
    const lang = settings.lang;
    settings = { ...defaults(), lang };
    unsupportedNote.hidden = true;
    applyAll();
    save();
  });

  /* ---------------------------------------------------------------- start */

  applyAll();
  // particles.js may finish starting after this file: apply "pause" again then
  window.addEventListener("load", () => setParticlesMoving(!settings.toggles.pause));
})();
