"use strict";

/* ==========================================================================
   render.js — builds the portfolio page from data/content.js
   --------------------------------------------------------------------------
   • The content lives in window.PORTFOLIO_CONTENT (data/content.js).
     You edit it from the dashboard at /admin — never by hand.
   • The markup for every repeated item is a <template> in index.html.
     This file only clones those templates and fills them with text,
     so there is no HTML inside this JavaScript file.
   • It must run BEFORE script.js, because script.js attaches the click
     events to the elements created here.
   ========================================================================== */

(function renderPortfolio() {
  const content = window.PORTFOLIO_CONTENT;
  if (!content) return;

  /* ---------------------------------------------------------------- helpers */

  /** Find one element by its data-* hook, e.g. find("data-project-list"). */
  const find = (attr) => document.querySelector(`[${attr}]`);

  /** Clone the first element inside <template id="...">. */
  const cloneTemplate = (id) =>
    document.getElementById(id).content.firstElementChild.cloneNode(true);

  /** Find a [data-slot="name"] element inside a cloned template. */
  const slot = (root, name) => root.querySelector(`[data-slot="${name}"]`);

  /** Only allow normal links (blocks things like "javascript:"). */
  const safeUrl = (value) => {
    const url = String(value || "").trim();
    if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "";
    return url; // relative path inside the site, e.g. assets/images/...
  };

  /** Replace everything inside a list with the given elements. */
  const fillList = (list, items) => {
    if (list) list.replaceChildren(...items);
  };

  const asArray = (value) => (Array.isArray(value) ? value : []);

  /* ---------------------------------------------------------------- profile */

  const profile = content.profile || {};

  if (profile.name) {
    document.title = `${profile.name} Portfolio`;
    const nameEl = find("data-profile-name");
    nameEl.textContent = profile.name;
    nameEl.title = profile.name;
  }

  find("data-profile-title").textContent = profile.title || "";

  if (profile.avatar) {
    const avatar = find("data-profile-avatar");
    avatar.src = safeUrl(profile.avatar);
    avatar.alt = profile.name || "";
  }

  /* --------------------------------------------------------------- contacts */

  const contactRow = (templateId, icon, label, value, href) => {
    const row = cloneTemplate(templateId);
    slot(row, "icon").setAttribute("name", icon);
    slot(row, "label").textContent = label;
    const valueEl = slot(row, "value");
    valueEl.textContent = value;
    if (href) valueEl.href = href;
    return row;
  };

  const contacts = [];
  if (profile.email) {
    contacts.push(contactRow("tpl-contact-link", "mail-outline", "Email", profile.email, `mailto:${profile.email}`));
  }
  if (profile.phone) {
    contacts.push(contactRow("tpl-contact-link", "phone-portrait-outline", "Phone", profile.phone, `tel:${profile.phone.replace(/\s/g, "")}`));
  }
  if (profile.location) {
    contacts.push(contactRow("tpl-contact-address", "location-outline", "Location", profile.location));
  }
  fillList(find("data-contacts-list"), contacts);

  /* ----------------------------------------------------------- social links */

  fillList(
    find("data-social-list"),
    asArray(content.socials)
      .filter((social) => safeUrl(social.url))
      .map((social) => {
        const item = cloneTemplate("tpl-social");
        const link = slot(item, "link");
        link.href = safeUrl(social.url);
        link.title = social.name || "";
        slot(item, "label").textContent = social.name || "Social link"; // read by screen readers
        slot(item, "icon").setAttribute("name", social.icon || "link-outline");
        return item;
      })
  );

  /* ------------------------------------------------------------------ about */

  // line breaks are kept by CSS (white-space: pre-line)
  find("data-about-text").textContent = content.about || "";

  fillList(
    find("data-service-list"),
    asArray(content.services).map((service) => {
      const item = cloneTemplate("tpl-service");
      const icon = slot(item, "icon");
      if (service.icon) {
        icon.src = safeUrl(service.icon);
        icon.alt = `${service.title} icon`;
      } else {
        icon.remove();
      }
      slot(item, "title").textContent = service.title || "";
      slot(item, "text").textContent = service.text || "";
      return item;
    })
  );

  /* --------------------------------------------------------- certifications */

  const certifications = asArray(content.certifications);
  find("data-certifications").hidden = certifications.length === 0;
  fillList(
    find("data-certification-list"),
    certifications.map((cert) => {
      const item = cloneTemplate("tpl-certification");
      slot(item, "title").textContent = cert.title || "";
      slot(item, "open").setAttribute("aria-label", `Open certificate${cert.title ? ": " + cert.title : ""}`);
      const image = slot(item, "image");
      image.src = safeUrl(cert.image);
      image.alt = cert.title || "Certificate";
      return item;
    })
  );

  /* --------------------------------------------------------------------- CV */

  const cvLink = find("data-cv-link");
  if (profile.cv) {
    cvLink.href = safeUrl(profile.cv);
    cvLink.setAttribute("download", `${profile.name || "My"} CV`);
  } else {
    find("data-cv-section").hidden = true;
  }

  /* ----------------------------------------------------------------- resume */

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** { month: "09", year: "2015" } -> "Sep 2015"  (month is optional -> "2015") */
  const formatDate = (date) => {
    if (!date || !date.year) return "";
    const month = MONTHS[parseInt(date.month, 10) - 1];
    return month ? `${month} ${date.year}` : String(date.year);
  };

  /** Start + end (or "Present") -> "Sep 2015 — Present" */
  const formatPeriod = (entry) => {
    const start = formatDate(entry.start);
    const end = entry.present ? "Present" : formatDate(entry.end);
    return [start, end].filter(Boolean).join(" — ");
  };

  const fillTimeline = (templateId, entry) => {
    const item = cloneTemplate(templateId);
    slot(item, "title").textContent = entry.title || "";
    slot(item, "period").textContent = formatPeriod(entry);
    const text = slot(item, "text");
    text.textContent = entry.text || "";
    text.hidden = !entry.text;
    return item;
  };

  fillList(
    find("data-education-list"),
    asArray(content.education).map((entry) => fillTimeline("tpl-timeline", entry))
  );

  fillList(
    find("data-experience-list"),
    asArray(content.experience).map((entry) => {
      const item = fillTimeline("tpl-experience", entry);
      const company = slot(item, "company");
      company.textContent = entry.company || "";
      company.hidden = !entry.company;
      return item;
    })
  );

  fillList(
    find("data-skill-list"),
    asArray(content.skills).map((skill) => {
      const percent = Math.max(0, Math.min(100, parseInt(skill.value, 10) || 0));
      const item = cloneTemplate("tpl-skill");
      slot(item, "name").textContent = skill.name || "";
      const value = slot(item, "value");
      value.value = percent;
      value.textContent = `${percent}%`;
      slot(item, "bar").style.width = `${percent}%`;
      return item;
    })
  );

  /* ------------------------------------------------------ optional sections */
  // Testimonials, awards and articles only appear when they are switched on
  // in the dashboard AND have at least one item.

  const sections = content.sections || {};

  /** Show a section only if it is switched on and has items. */
  const showSection = (attr, key) => {
    const items = asArray(content[key]);
    const visible = Boolean(sections[key]) && items.length > 0;
    find(attr).hidden = !visible;
    return visible ? items : [];
  };

  /** Set a link if there is one; otherwise keep plain text. */
  const setOptionalLink = (el, url) => {
    const safe = safeUrl(url);
    if (safe) el.href = safe;
    else el.removeAttribute("href");
  };

  fillList(
    find("data-testimonial-list"),
    showSection("data-testimonials-section", "testimonials").map((entry) => {
      const item = cloneTemplate("tpl-testimonial");
      item.querySelector("[data-testimonials-item]").setAttribute("aria-label", `Read testimonial from ${entry.name || "a client"}`);
      const avatar = slot(item, "avatar");
      if (entry.avatar) {
        avatar.src = safeUrl(entry.avatar);
        avatar.alt = entry.name || "";
      } else {
        avatar.closest("figure").remove();
      }
      slot(item, "name").textContent = entry.name || "";
      const role = slot(item, "role");
      role.textContent = entry.role || "";
      role.hidden = !entry.role;
      slot(item, "quote").textContent = entry.quote || "";
      return item;
    })
  );

  /** Awards and articles share the same layout: title (link), meta line, text. */
  const linkedEntry = (templateId, entry, source) => {
    const item = cloneTemplate(templateId);
    const title = slot(item, "title");
    title.textContent = entry.title || "";
    setOptionalLink(title, entry.link);
    slot(item, "meta").textContent = [entry[source], formatDate(entry.date)].filter(Boolean).join(" · ");
    const text = slot(item, "text");
    text.textContent = entry.text || "";
    text.hidden = !entry.text;
    return item;
  };

  fillList(
    find("data-award-list"),
    showSection("data-awards-section", "awards").map((entry) => linkedEntry("tpl-award", entry, "issuer"))
  );

  fillList(
    find("data-article-list"),
    showSection("data-articles-section", "articles").map((entry) => linkedEntry("tpl-article", entry, "publication"))
  );

  /* -------------------------------------------------------------- portfolio */

  const projects = asArray(content.projects).filter((project) => !project.hidden);

  // Only show categories that have at least one visible project
  const usedCategories = new Set(projects.map((project) => String(project.category).toLowerCase()));
  const categories = ["All", ...asArray(content.categories).filter((cat) => usedCategories.has(cat.toLowerCase()))];

  fillList(
    find("data-filter-list"),
    categories.map((name, index) => {
      const item = cloneTemplate("tpl-filter");
      const button = slot(item, "name");
      button.textContent = name;
      button.setAttribute("aria-pressed", String(index === 0));
      if (index === 0) button.classList.add("active");
      return item;
    })
  );

  fillList(
    find("data-select-list"),
    categories.map((name) => {
      const item = cloneTemplate("tpl-select");
      slot(item, "name").textContent = name;
      return item;
    })
  );

  fillList(
    find("data-project-list"),
    projects.map((project) => {
      const item = cloneTemplate("tpl-project");
      // script.js filters by comparing this with the lower-cased button text
      item.dataset.category = String(project.category).toLowerCase();

      const link = slot(item, "link");
      const url = safeUrl(project.link);
      link.href = url || "#";
      if (url) {
        link.target = "_blank";
        link.rel = "noopener";
      } else {
        slot(item, "new-tab").remove(); // no link: nothing opens
        link.setAttribute("aria-disabled", "true");
      }

      const image = slot(item, "image");
      image.src = safeUrl(project.image);
      image.alt = project.title || "";

      slot(item, "title").textContent = project.title || "";
      slot(item, "category").textContent = project.category || "";
      return item;
    })
  );
})();
