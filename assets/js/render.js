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
        link.setAttribute("aria-label", social.name || "Social link");
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

  const timelineItem = (entry) => {
    const item = cloneTemplate("tpl-timeline");
    slot(item, "title").textContent = entry.title || "";
    slot(item, "period").textContent = entry.period || "";
    slot(item, "text").textContent = entry.text || "";
    return item;
  };
  fillList(find("data-education-list"), asArray(content.education).map(timelineItem));
  fillList(find("data-experience-list"), asArray(content.experience).map(timelineItem));

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
