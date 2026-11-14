"use strict";

/* ==========================================================================
   admin.js — Portfolio dashboard
   --------------------------------------------------------------------------
   How it works (no backend needed):
   1. You log in with a GitHub access token.
   2. The dashboard downloads data/content.js from your GitHub repo.
   3. You edit the content; new images/PDFs wait in memory.
   4. "Publish" sends everything to GitHub as ONE commit.
   5. GitHub Pages rebuilds the site, so the portfolio updates by itself.

   All markup lives in admin/index.html (screens + <template>s).
   All styles live in admin/admin.css.
   This file only contains logic.
   ========================================================================== */


/* ==========================================================================
   1. SETTINGS
   ========================================================================== */

const API_URL = "https://api.github.com";
const CONTENT_PATH = "data/content.js";
const CONTENT_HEADER =
  "/* Portfolio content — edited by the dashboard (admin/). Keep the JSON valid. */\n" +
  "window.PORTFOLIO_CONTENT = ";
const STORAGE_KEY = "portfolio-dashboard";
const MAX_UPLOAD_MB = 25;

/** A date is { month: "01".."12" or "", year: "2024" }. */
const EMPTY_DATE = { month: "", year: "" };

/** Empty item used when you press "Add" in each list. */
const BLANK_ITEMS = {
  socials: { name: "Dribbble", icon: "logo-dribbble", url: "" },
  services: { icon: "", title: "", text: "" },
  education: { title: "", start: EMPTY_DATE, end: EMPTY_DATE, present: false, text: "" },
  experience: { title: "", company: "", start: EMPTY_DATE, end: EMPTY_DATE, present: false, text: "" },
  skills: { name: "", value: 50 },
  testimonials: { avatar: "", name: "", role: "", quote: "" },
  awards: { title: "", issuer: "", date: EMPTY_DATE, link: "", text: "" },
  articles: { title: "", publication: "", date: EMPTY_DATE, link: "", text: "" },
};

/** Which <template> holds the fields for each list. */
const LIST_FIELDS_TEMPLATE = {
  socials: "tpl-socials-fields",
  services: "tpl-services-fields",
  education: "tpl-education-fields",
  experience: "tpl-experience-fields",
  skills: "tpl-skills-fields",
  testimonials: "tpl-testimonials-fields",
  awards: "tpl-awards-fields",
  articles: "tpl-articles-fields",
};

/** Which lists are shown on each dashboard page. */
const VIEW_LISTS = {
  links: ["socials"],
  about: ["services"],
  resume: ["education", "experience"],
  skills: ["skills"],
  testimonials: ["testimonials"],
  awards: ["awards"],
  articles: ["articles"],
};

/** Optional sections that can be switched on/off for the website. */
const EXTRA_SECTIONS = ["testimonials", "awards", "articles"];


/* ==========================================================================
   2. STATE — everything the dashboard remembers while it is open
   ========================================================================== */

const state = {
  config: null,        // { owner, repo, branch, token }
  content: null,       // the portfolio content being edited
  savedJson: "",       // content as it was at the last publish (to detect changes)
  uploads: {},         // repo path -> base64 file waiting to be published
  previews: {},        // repo path -> local preview URL for new images
  view: "projects",    // current dashboard page
  filter: "All",       // category chip selected on the Projects page
  search: "",          // text typed in the project search box
  status: { text: "", kind: "" },
  busy: false,         // true while publishing
  dialogIndex: -1,     // project being edited (-1 = new project)
  dialogDraft: null,   // copy of that project while the dialog is open
};


/* ==========================================================================
   3. SMALL HELPERS
   ========================================================================== */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Clone the first element inside <template id="...">. */
const cloneTemplate = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);

/** Find [data-slot="name"] inside an element. */
const slot = (root, name) => root.querySelector(`[data-slot="${name}"]`);

const deepCopy = (value) => JSON.parse(JSON.stringify(value));

/** "profile.avatar" -> content.profile.avatar */
const getPath = (obj, path) => path.split(".").reduce((o, key) => (o == null ? o : o[key]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, key) => (o[key] ??= {}), obj);
  target[last] = value;
};

/** Turn any text into a safe file name: "My Shot.png" -> "my-shot". */
const slugify = (text) =>
  String(text || "file")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "file";

/** True when there are changes that are not published yet. */
const hasChanges = () =>
  JSON.stringify(state.content) !== state.savedJson || Object.keys(state.uploads).length > 0;

/** Image/file URL for previews inside the dashboard. */
function previewUrl(path) {
  if (!path) return "";
  if (state.previews[path]) return state.previews[path];   // new upload, not published yet
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return "../" + path.split("/").map(encodeURIComponent).join("/"); // file in the site
}

/** Swap two items in an array (used by all "move" buttons). */
function moveItem(array, index, step) {
  const target = index + step;
  if (target < 0 || target >= array.length) return false;
  [array[index], array[target]] = [array[target], array[index]];
  return true;
}

/**
 * Two-click delete: the first click arms the button (turns red),
 * the second click within 2.5 s runs the action. No browser popups.
 */
function confirmClick(button, action) {
  let timer;
  const label = button.textContent;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (button.classList.contains("armed")) {
      clearTimeout(timer);
      disarm();
      action();
      return;
    }
    button.classList.add("armed");
    if (button.dataset.confirmLabel) button.textContent = button.dataset.confirmLabel;
    else button.title = "Click again to delete";
    timer = setTimeout(disarm, 2500);
  });
  function disarm() {
    button.classList.remove("armed");
    if (button.dataset.confirmLabel) button.textContent = label;
    else button.title = "Delete";
  }
}

/** Let an element accept a dropped file. */
function makeDropZone(element, onFile) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("over");
  });
  element.addEventListener("dragleave", () => element.classList.remove("over"));
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    element.classList.remove("over");
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

/** Open the system file picker and resolve with the chosen file. */
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files[0] || null));
    input.click();
  });
}


/* ==========================================================================
   4. SAVED LOGIN (this device only)
   ========================================================================== */

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveConfig(config, remember) {
  try {
    const raw = JSON.stringify(config);
    if (remember) {
      localStorage.setItem(STORAGE_KEY, raw);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, raw);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* storage blocked (private mode): login stays for this tab only */
  }
}

function clearConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}


/* ==========================================================================
   5. GITHUB API
   ========================================================================== */

/** Call the GitHub API for the connected repo. Throws a friendly error. */
async function github(path, { method = "GET", body, raw = false } = {}) {
  const { owner, repo, token } = state.config;
  const response = await fetch(`${API_URL}/repos/${owner}/${repo}${path}`, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).message;
    } catch {
      /* no JSON body */
    }
    const messages = {
      401: "The token is wrong or expired. Create a new one and connect again.",
      403: 'The token can\'t write to this repo. Give it "Contents: Read and write" permission.',
      404: "Not found. Check the username, repo name and branch, and that the token has access to this repo.",
    };
    const error = new Error(messages[response.status] || `GitHub error ${response.status}${detail ? ": " + detail : ""}`);
    error.status = response.status;
    throw error;
  }
  return raw ? response.text() : response.json();
}

/** Download and parse data/content.js from the repo. */
async function fetchContent() {
  const branch = encodeURIComponent(state.config.branch);
  let text;
  try {
    text = await github(`/contents/${CONTENT_PATH}?ref=${branch}`, { raw: true });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github(`/branches/${branch}`); // throws if repo/branch is wrong
    throw new Error(`Connected, but "${CONTENT_PATH}" isn't in the repo yet.`);
  }
  // the file is "window.PORTFOLIO_CONTENT = { ...json... };"
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

/** Send content + new files to GitHub as a single commit. */
async function publish() {
  if (state.busy || !hasChanges()) return;
  state.busy = true;
  const branch = encodeURIComponent(state.config.branch);
  const files = Object.entries(state.uploads);

  try {
    setStatus(files.length ? `Uploading ${files.length} file${files.length > 1 ? "s" : ""}…` : "Publishing…");

    // a) where the branch is now
    const ref = await github(`/git/ref/heads/${branch}`);
    const headSha = ref.object.sha;
    const headCommit = await github(`/git/commits/${headSha}`);

    // b) upload every new file as a "blob"
    const tree = [];
    for (const [path, base64] of files) {
      const blob = await github("/git/blobs", { method: "POST", body: { content: base64, encoding: "base64" } });
      tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // c) upload the updated content file
    setStatus("Publishing…");
    const contentText = CONTENT_HEADER + JSON.stringify(state.content, null, 2) + ";\n";
    const contentBlob = await github("/git/blobs", { method: "POST", body: { content: contentText, encoding: "utf-8" } });
    tree.push({ path: CONTENT_PATH, mode: "100644", type: "blob", sha: contentBlob.sha });

    // d) make the commit and move the branch to it
    const newTree = await github("/git/trees", { method: "POST", body: { base_tree: headCommit.tree.sha, tree } });
    const newCommit = await github("/git/commits", {
      method: "POST",
      body: { message: "Update portfolio content from dashboard", tree: newTree.sha, parents: [headSha] },
    });
    await github(`/git/refs/heads/${branch}`, { method: "PATCH", body: { sha: newCommit.sha } });

    state.savedJson = JSON.stringify(state.content);
    state.uploads = {};
    setStatus("Published ✓ Your site updates in 1–2 minutes (refresh it to see the change).", "ok");
  } catch (error) {
    setStatus("Couldn't publish: " + error.message, "err");
  } finally {
    state.busy = false;
    renderTopBar();
  }
}


/* ==========================================================================
   6. FILE UPLOADS (kept in memory until you press Publish)
   ========================================================================== */

/** File/Blob -> base64 text (what the GitHub API expects). */
const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Resize big photos and convert them to WebP so the site stays fast.
 * square = true crops the centre of the photo to a square (profile pictures).
 */
async function optimizeImage(file, maxWidth, square = false) {
  if (/svg|gif/.test(file.type)) {
    return { blob: file, ext: file.type.includes("svg") ? "svg" : "gif" };
  }
  const bitmap = await createImageBitmap(file);

  // part of the photo to keep: everything, or a centred square
  let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (square) {
    const side = Math.min(bitmap.width, bitmap.height);
    sx = (bitmap.width - side) / 2;
    sy = Math.max(0, (bitmap.height - side) * 0.2); // portrait: stay near the top, where the face is
    sw = sh = side;
  }

  const scale = Math.min(1, maxWidth / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };

  // browsers without WebP export (older Safari)
  const isPng = file.type === "image/png";
  const fallback = await new Promise((resolve) => canvas.toBlob(resolve, isPng ? "image/png" : "image/jpeg", 0.88));
  return { blob: fallback, ext: isPng ? "png" : "jpg" };
}

/**
 * Prepare a file for publishing and return its future path in the repo.
 * kind: "image" (optimized) or "file" (uploaded as-is, e.g. a PDF).
 */
async function addUpload(file, { folder = "assets/images/uploads", name, maxWidth = 1600, kind = "image", square = false } = {}) {
  if (!file) return null;
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    setStatus(`That file is over ${MAX_UPLOAD_MB} MB. Pick a smaller one.`, "err");
    return null;
  }

  let blob = file;
  let ext = (file.name.split(".").pop() || "bin").toLowerCase();
  if (kind === "image") {
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file (JPG, PNG, WebP, SVG).", "err");
      return null;
    }
    ({ blob, ext } = await optimizeImage(file, maxWidth, square));
  }

  const baseName = slugify(name || file.name.replace(/\.[^.]+$/, ""));
  const path = `${folder}/${baseName}-${Date.now().toString(36)}.${ext}`;
  state.uploads[path] = await toBase64(blob);
  state.previews[path] = URL.createObjectURL(blob);
  return path;
}


/* ==========================================================================
   7. IMAGE PICKER (.img-pick blocks in the HTML)
   ========================================================================== */

/** Show the current image (or the empty icon) inside a picker. */
function paintPicker(picker, path) {
  const img = $(".thumb img", picker);
  const emptyIcon = $(".thumb ion-icon", picker);
  img.hidden = !path;
  emptyIcon.hidden = Boolean(path);
  if (path) img.src = previewUrl(path);
}

/**
 * Wire a picker. getTarget() returns { obj, key } — where the image path is stored.
 * Works for static pickers (profile photo) and pickers inside templates.
 */
function setupPicker(picker, getTarget) {
  const choose = async (file) => {
    const { obj, key } = getTarget();
    const path = await addUpload(file, {
      maxWidth: Number(picker.dataset.maxWidth) || 1600,
      name: picker.dataset.fileName,
      square: "square" in picker.dataset,
    });
    if (!path) return;
    obj[key] = path;
    paintPicker(picker, path);
    if (picker.dataset.image === "profile.avatar") renderSidebar();
    onContentChanged();
  };
  $("[data-pick]", picker).addEventListener("click", async () => choose(await pickFile("image/*")));
  makeDropZone(picker, choose);
}


/* ==========================================================================
   8. DASHBOARD PAGES
   ========================================================================== */

/** Called after every edit: refresh the status bar + Publish button. */
function onContentChanged() {
  renderTopBar();
}

/* ---------- Projects ---------- */

function renderProjects() {
  const { projects, categories } = state.content;
  const query = state.search.trim().toLowerCase();

  // category chips
  const counts = {};
  projects.forEach((project) => (counts[project.category] = (counts[project.category] || 0) + 1));
  $("#category-chips").replaceChildren(
    ...["All", ...categories].map((category) => {
      const chip = cloneTemplate("tpl-chip");
      slot(chip, "name").textContent = category;
      slot(chip, "count").textContent = category === "All" ? projects.length : counts[category] || 0;
      chip.classList.toggle("active", state.filter === category);
      chip.addEventListener("click", () => {
        state.filter = category;
        renderProjects();
      });
      return chip;
    })
  );

  // project cards (the "New project" tile stays first)
  const grid = $("#project-grid");
  $$(".proj", grid).forEach((card) => card.remove());

  const visible = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) =>
      (state.filter === "All" || project.category === state.filter) &&
      (!query || project.title.toLowerCase().includes(query)));

  visible.forEach(({ project, index }) => grid.append(projectCard(project, index)));
  $("#no-projects").hidden = visible.length > 0;
}

function projectCard(project, index) {
  const { projects } = state.content;
  const card = cloneTemplate("tpl-project-card");
  card.classList.toggle("is-hidden", Boolean(project.hidden));

  const image = slot(card, "image");
  image.hidden = !project.image;
  if (project.image) image.src = previewUrl(project.image);

  slot(card, "hidden-badge").hidden = !project.hidden;
  slot(card, "title").textContent = project.title || "Untitled";
  slot(card, "category").textContent = project.category;

  const link = slot(card, "link");
  link.hidden = !project.link;
  if (project.link) link.href = project.link;

  const action = (name) => $$(`[data-action="${name}"]`, card);
  action("edit").forEach((el) => el.addEventListener("click", () => openProjectDialog(index)));

  const [earlier] = action("earlier");
  const [later] = action("later");
  const [first] = action("first");
  earlier.disabled = first.disabled = index === 0;
  later.disabled = index === projects.length - 1;
  earlier.addEventListener("click", () => moveItem(projects, index, -1) && refresh());
  later.addEventListener("click", () => moveItem(projects, index, 1) && refresh());
  first.addEventListener("click", () => {
    projects.unshift(...projects.splice(index, 1));
    refresh();
  });

  confirmClick(action("delete")[0], () => {
    projects.splice(index, 1);
    refresh();
  });
  return card;
}

/* ---------- Project dialog ---------- */

function openProjectDialog(index) {
  const { projects, categories } = state.content;
  const isNew = index < 0;
  state.dialogIndex = index;
  state.dialogDraft = isNew
    ? { title: "", category: state.filter !== "All" ? state.filter : categories[0] || "", image: "", link: "" }
    : deepCopy(projects[index]);

  const draft = state.dialogDraft;
  const form = $("#project-form");

  $("#project-dialog-title").textContent = isNew ? "New project" : "Edit project";
  $("#project-save").textContent = isNew ? "Add project" : "Done";
  $("#project-delete").hidden = isNew;
  $("#project-error").textContent = "";

  form.elements.title.value = draft.title;
  form.elements.link.value = draft.link || "";
  form.elements.hidden.checked = Boolean(draft.hidden);
  form.elements.newCategory.value = "";
  form.elements.newCategory.hidden = true;

  // category options: existing categories + "New category…"
  const select = form.elements.category;
  select.replaceChildren(
    ...categories.map((category) => new Option(category, category, false, category === draft.category)),
    new Option("+ New category…", "__new")
  );

  paintProjectCover();
  $("#project-dialog").showModal();
  if (isNew) form.elements.title.focus();
}

function paintProjectCover() {
  const cover = $("#project-cover");
  const path = state.dialogDraft.image;
  $("img", cover).hidden = !path;
  $(".big-cover-empty", cover).hidden = Boolean(path);
  if (path) $("img", cover).src = previewUrl(path);
}

async function setProjectCover(file) {
  const path = await addUpload(file, { name: $("#project-form").elements.title.value || "project" });
  if (!path) return;
  state.dialogDraft.image = path;
  $("#project-error").textContent = "";
  paintProjectCover();
}

function saveProjectDialog(event) {
  event.preventDefault();
  const { projects, categories } = state.content;
  const form = event.target;
  const draft = state.dialogDraft;
  const showError = (message) => ($("#project-error").textContent = message);

  // category (maybe a brand-new one)
  let category = form.elements.category.value;
  if (category === "__new") {
    const name = form.elements.newCategory.value.trim();
    if (!name) return showError("Type a name for the new category.");
    const existing = categories.find((c) => c.toLowerCase() === name.toLowerCase());
    if (!existing) categories.push(name);
    category = existing || name;
  }

  const title = form.elements.title.value.trim();
  if (!title) return showError("Give the project a title.");
  if (!draft.image) return showError("Add a cover image.");

  let link = form.elements.link.value.trim();
  if (link && !/^https?:\/\//i.test(link)) link = "https://" + link;

  const project = { title, category, image: draft.image, link };
  if (form.elements.hidden.checked) project.hidden = true;

  if (state.dialogIndex < 0) projects.unshift(project);
  else projects[state.dialogIndex] = project;

  $("#project-dialog").close();
  refresh();
}

/* ---------- Categories ---------- */

function renderCategories() {
  const { categories, projects } = state.content;
  const countOf = (category) => projects.filter((project) => project.category === category).length;

  $("#category-list").replaceChildren(
    ...categories.map((category, index) => {
      const row = cloneTemplate("tpl-category");
      const count = countOf(category);
      const others = categories.filter((c) => c !== category);

      // rename (projects follow the new name)
      const input = slot(row, "name");
      input.value = category;
      input.addEventListener("change", () => {
        const name = input.value.trim();
        if (!name || name === category) {
          input.value = category;
          return;
        }
        if (others.some((c) => c.toLowerCase() === name.toLowerCase())) {
          setStatus(`"${name}" already exists.`, "err");
          input.value = category;
          return;
        }
        categories[index] = name;
        projects.forEach((project) => {
          if (project.category === category) project.category = name;
        });
        if (state.filter === category) state.filter = name;
        refresh();
      });

      slot(row, "count").textContent = `${count} project${count === 1 ? "" : "s"}`;

      // where its projects go if the category is deleted
      const moveBox = slot(row, "move");
      const moveTo = slot(row, "move-to");
      moveBox.hidden = !(count > 0 && others.length);
      moveTo.replaceChildren(...others.map((c) => new Option(c, c)));

      const up = $('[data-action="up"]', row);
      const down = $('[data-action="down"]', row);
      up.disabled = index === 0;
      down.disabled = index === categories.length - 1;
      up.addEventListener("click", () => moveItem(categories, index, -1) && refresh());
      down.addEventListener("click", () => moveItem(categories, index, 1) && refresh());

      const del = $('[data-action="delete"]', row);
      if (count > 0 && !others.length) {
        del.disabled = true;
        del.title = "Add another category first";
      } else {
        confirmClick(del, () => {
          projects.forEach((project) => {
            if (project.category === category) project.category = moveTo.value;
          });
          categories.splice(index, 1);
          if (state.filter === category) state.filter = "All";
          refresh();
        });
      }
      return row;
    })
  );
}

function addCategory() {
  const input = $("#new-category");
  const name = input.value.trim();
  if (!name) return;
  if (state.content.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
    setStatus(`"${name}" already exists.`, "err");
    return;
  }
  state.content.categories.push(name);
  input.value = "";
  refresh();
}

/* ---------- Profile (static fields + CV) ---------- */

function renderProfile() {
  const { profile } = state.content;
  const cv = profile.cv;
  $("#cv-link").hidden = !cv;
  $("#cv-remove").hidden = !cv;
  $("#cv-empty").hidden = Boolean(cv);
  if (cv) {
    $("#cv-link").href = previewUrl(cv);
    $("#cv-name").textContent = decodeURIComponent(cv.split("/").pop());
  }
  $("#cv-upload").lastChild.textContent = cv ? "Replace PDF" : "Upload PDF";
}

async function uploadCv() {
  const file = await pickFile("application/pdf");
  if (!file) return;
  if (file.type !== "application/pdf") {
    setStatus("Please choose a PDF file.", "err");
    return;
  }
  const { profile } = state.content;
  const path = await addUpload(file, { folder: "assets/cv", name: `${profile.name || "my"} CV`, kind: "file" });
  if (!path) return;
  profile.cv = path;
  renderProfile();
  onContentChanged();
}

/** Put the current values into every [data-bind] field and picker. */
function fillStaticFields() {
  $$("[data-bind]").forEach((field) => (field.value = getPath(state.content, field.dataset.bind) ?? ""));
  $$(".img-pick[data-image]").forEach((picker) => paintPicker(picker, getPath(state.content, picker.dataset.image)));
}

/* ---------- Generic lists (socials, services, education, experience, skills) ---------- */

function renderList(key) {
  const items = state.content[key];
  const container = $(`#${key}-list`);

  container.replaceChildren(
    ...items.map((item, index) => {
      const row = cloneTemplate("tpl-list-item");
      const body = cloneTemplate(LIST_FIELDS_TEMPLATE[key]);
      $(".item-body", row).append(body);

      bindFields(body, item);
      if (key === "socials") setupSocialRow(body, item);

      // image pickers inside the row (service icon, testimonial photo)
      $$(".img-pick[data-image-field]", body).forEach((picker) => {
        const field = picker.dataset.imageField;
        paintPicker(picker, item[field]);
        setupPicker(picker, () => ({ obj: item, key: field }));
      });

      const up = $('[data-action="up"]', row);
      const down = $('[data-action="down"]', row);
      up.disabled = index === 0;
      down.disabled = index === items.length - 1;
      up.addEventListener("click", () => moveItem(items, index, -1) && refresh());
      down.addEventListener("click", () => moveItem(items, index, 1) && refresh());
      confirmClick($('[data-action="delete"]', row), () => {
        items.splice(index, 1);
        refresh();
      });
      return row;
    })
  );
}

/**
 * Connect every [data-field] control inside a row to the item.
 * Keys can be nested ("start.month"); checkboxes store true/false.
 */
function bindFields(root, item) {
  // fill every month dropdown with the options from <template id="tpl-month-options">
  $$("select[data-months]", root).forEach((select) => {
    select.replaceChildren(...cloneTemplate("tpl-month-options").children);
  });

  $$("[data-field]", root).forEach((field) => {
    const key = field.dataset.field;
    const value = getPath(item, key);
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";

    const output = $(`[data-output="${key}"]`, root);
    if (output) output.textContent = `${value ?? 0}%`;

    field.addEventListener(field.type === "checkbox" ? "change" : "input", () => {
      let next = field.value;
      if (field.type === "range") next = Number(field.value);
      if (field.type === "checkbox") next = field.checked;
      setPath(item, key, next);
      if (output) output.textContent = `${next}%`;
      if (key === "present") updateEndDate(root, item);
      onContentChanged();
    });
  });

  updateEndDate(root, item);
}

/** "Present" ticked -> the end date is not needed, so it is disabled. */
function updateEndDate(root, item) {
  const endField = $("[data-end-date]", root);
  if (!endField) return;
  endField.classList.toggle("is-disabled", Boolean(item.present));
  $$("select, input", endField).forEach((control) => (control.disabled = Boolean(item.present)));
}

/** Social row: the platform dropdown sets both the name and the icon. */
function setupSocialRow(body, item) {
  const select = slot(body, "platform");
  const icon = slot(body, "icon");
  const known = $$("option", select).some((option) => option.value === item.icon);
  if (!known) select.add(new Option(item.name || "Custom", item.icon || "link-outline"), 0);
  select.value = item.icon || "link-outline";
  icon.setAttribute("name", select.value);

  select.addEventListener("change", () => {
    item.icon = select.value;
    item.name = select.selectedOptions[0].textContent;
    icon.setAttribute("name", item.icon);
    onContentChanged();
  });
}

/* ---------- Extra sections (testimonials, awards, articles) ---------- */

/** Show the on/off switch and the "this section is off" note. */
function renderSectionSwitch(key) {
  const on = Boolean(state.content.sections[key]);
  $(`[data-section-toggle="${key}"]`).checked = on;
  $(`[data-section-note="${key}"]`).hidden = on;
}

/* ---------- Certificates ---------- */

function renderCertificates() {
  const certs = state.content.certifications;
  const grid = $("#cert-grid");
  $$(".cert", grid).forEach((card) => card.remove());
  const addTile = $("#add-cert");

  certs.forEach((cert, index) => {
    const card = cloneTemplate("tpl-cert");
    slot(card, "image").src = previewUrl(cert.image);

    const title = slot(card, "title");
    title.value = cert.title || "";
    title.addEventListener("input", () => {
      cert.title = title.value;
      onContentChanged();
    });

    $('[data-action="replace"]', card).addEventListener("click", async () => {
      const path = await addUpload(await pickFile("image/*"), { folder: "assets/images/Certifications", name: cert.title || "certificate" });
      if (!path) return;
      cert.image = path;
      refresh();
    });

    const earlier = $('[data-action="earlier"]', card);
    earlier.disabled = index === 0;
    earlier.addEventListener("click", () => moveItem(certs, index, -1) && refresh());
    confirmClick($('[data-action="delete"]', card), () => {
      certs.splice(index, 1);
      refresh();
    });

    grid.insertBefore(card, addTile);
  });
}

async function addCertificate(file) {
  const path = await addUpload(file, { folder: "assets/images/Certifications", name: "certificate" });
  if (!path) return;
  state.content.certifications.push({ image: path, title: "" });
  refresh();
}


/* ==========================================================================
   9. SCREEN + TOP BAR
   ========================================================================== */

function setStatus(text, kind = "") {
  state.status = { text, kind };
  renderTopBar();
}

/** Status text + Publish button state. */
function renderTopBar() {
  const changed = hasChanges();
  let { text, kind } = state.status;
  if (changed && kind !== "err" && !state.busy) {
    text = "Unsaved changes — press Publish to put them live.";
    kind = "dirty";
  }

  const status = $("#status");
  status.className = `status ${kind}`;
  status.textContent = text || "All changes are live.";

  const button = $("#publish-button");
  button.disabled = !changed || state.busy;
  $(".spin", button).hidden = !state.busy;
  $("ion-icon", button).hidden = state.busy;
  $(".btn-label", button).textContent = state.busy ? "Publishing" : "Publish";
}

/** Sidebar: photo, name, counters, active page. */
function renderSidebar() {
  const { profile } = state.content;
  $("#brand-avatar").src = previewUrl(profile.avatar);
  $("#brand-name").textContent = profile.name || "My portfolio";

  $$("[data-count]").forEach((counter) => (counter.textContent = state.content[counter.dataset.count].length));

  // extra sections: "Off" pill instead of the counter while switched off
  EXTRA_SECTIONS.forEach((key) => {
    const on = Boolean(state.content.sections[key]);
    $(`[data-section-pill="${key}"]`).hidden = on;
    $(`[data-count="${key}"]`).hidden = !on;
  });
  $$(".nav[data-view]").forEach((nav) => nav.classList.toggle("active", nav.dataset.view === state.view));
}

/** Re-draw the current page (after any change to lists). */
function refresh() {
  renderSidebar();
  const view = state.view;
  if (view === "projects") renderProjects();
  if (view === "categories") renderCategories();
  if (view === "profile") renderProfile();
  if (view === "certs") renderCertificates();
  if (EXTRA_SECTIONS.includes(view)) renderSectionSwitch(view);
  (VIEW_LISTS[view] || []).forEach(renderList);
  renderTopBar();
}

/** Switch to another dashboard page. */
function showView(view) {
  state.view = view;
  $$(".panel").forEach((panel) => (panel.hidden = panel.dataset.panel !== view));
  $("#view-title").textContent = $(`.nav[data-view="${view}"] .nav-label`).textContent;
  refresh();
  window.scrollTo(0, 0);
}

/** Show exactly one of: loading, login, app. */
function showScreen(name) {
  $("#loading-screen").hidden = name !== "loading";
  $("#login-screen").hidden = name !== "login";
  $("#app-screen").hidden = name !== "app";
}


/* ==========================================================================
   10. LOGIN / LOGOUT
   ========================================================================== */

/**
 * Address of the public website.
 * Online, the site is simply the folder above /admin/
 * (e.g. https://abdallahzezo77.github.io/Portfolio/).
 */
function liveSiteUrl() {
  if (location.protocol.startsWith("http") && location.pathname.includes("/admin")) {
    return new URL("../", location.href).href;
  }
  const owner = state.config.owner.toLowerCase();
  const repo = state.config.repo;
  return repo.toLowerCase() === `${owner}.github.io` ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

/** On GitHub Pages we can guess the username and repo from the address. */
function guessRepoFromUrl() {
  const match = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!match) return { owner: "", repo: "" };
  const firstFolder = location.pathname.split("/").filter(Boolean)[0];
  const repo = firstFolder && firstFolder !== "admin" ? firstFolder : `${match[1]}.github.io`;
  return { owner: match[1], repo };
}

function showLogin(message = "") {
  const form = $("#login-form");
  const guess = guessRepoFromUrl();
  form.elements.owner.value = state.config?.owner || guess.owner;
  form.elements.repo.value = state.config?.repo || guess.repo;
  form.elements.branch.value = state.config?.branch || "main";
  form.elements.token.value = "";
  $("#login-error").textContent = message;
  updateTokenLink();
  showScreen("login");
}

/** Pre-fill GitHub's "new token" page with the right settings. */
function updateTokenLink() {
  const form = $("#login-form");
  const params = new URLSearchParams({
    name: `Portfolio dashboard (${form.elements.repo.value || "portfolio"})`,
    description: "Lets the portfolio dashboard publish content",
    contents: "write",
  });
  if (form.elements.owner.value) params.set("target_name", form.elements.owner.value);
  $("#token-link").href = `https://github.com/settings/personal-access-tokens/new?${params}`;
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.target;
  const value = (name) => form.elements[name].value.trim();
  const error = $("#login-error");
  const button = $("#login-button");

  if (!value("owner") || !value("repo") || !value("token")) {
    error.textContent = "Fill in all fields.";
    return;
  }

  button.disabled = true;
  $(".spin", button).hidden = false;
  $(".btn-label", button).textContent = "Connecting…";
  error.textContent = "";

  state.config = { owner: value("owner"), repo: value("repo"), branch: value("branch") || "main", token: value("token") };
  try {
    await startDashboard();
    saveConfig(state.config, form.elements.remember.checked);
    form.elements.token.value = "";
  } catch (problem) {
    error.textContent = problem.message;
  } finally {
    button.disabled = false;
    $(".spin", button).hidden = true;
    $(".btn-label", button).textContent = "Connect";
  }
}

let logoutArmed = false;
function logout() {
  if (hasChanges() && !logoutArmed) {
    logoutArmed = true;
    setStatus("You have unpublished changes. Click Log out again to discard them.", "err");
    setTimeout(() => (logoutArmed = false), 3000);
    return;
  }
  clearConfig();
  state.content = null;
  state.uploads = {};
  showLogin();
}

/** Save a copy of all content to your computer. */
function downloadBackup() {
  const blob = new Blob([CONTENT_HEADER + JSON.stringify(state.content, null, 2) + ";\n"], { type: "text/javascript" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "content.js";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * Make sure the content has every list the dashboard expects, and upgrade
 * older entries ("period" text -> start/end dates, details -> company).
 */
function normalizeContent(content) {
  ["socials", "services", "certifications", "education", "experience", "skills",
    "categories", "projects", ...EXTRA_SECTIONS].forEach((key) => (content[key] ||= []));
  content.profile ||= {};
  content.sections ||= {};
  EXTRA_SECTIONS.forEach((key) => (content.sections[key] ??= false));

  const yearOf = (text) => (String(text || "").match(/\d{4}/) || [""])[0];
  ["education", "experience"].forEach((key) => {
    content[key].forEach((entry) => {
      if (!("period" in entry)) return;
      const [from = "", to = ""] = entry.period.split(/[-—–]/);
      entry.start = { month: "", year: yearOf(from) };
      entry.present = /present/i.test(to);
      entry.end = { month: "", year: entry.present ? "" : yearOf(to) };
      if (key === "experience" && !("company" in entry)) {
        entry.company = (entry.text || "").trim();
        entry.text = "";
      }
      delete entry.period;
    });
  });
  return content;
}

/** Load the content and open the dashboard. */
async function startDashboard() {
  const content = await fetchContent();
  normalizeContent(content);

  state.content = content;
  state.savedJson = JSON.stringify(content);
  state.uploads = {};
  state.status = { text: "", kind: "" };

  $("#site-link").href = liveSiteUrl();

  fillStaticFields();
  showScreen("app");
  showView(state.view);
}


/* ==========================================================================
   11. EVENTS — attached once when the page loads
   ========================================================================== */

function attachEvents() {
  // login
  $("#login-form").addEventListener("submit", handleLogin);
  $("#login-form").addEventListener("input", updateTokenLink);

  // sidebar
  $$(".nav[data-view]").forEach((nav) => nav.addEventListener("click", () => showView(nav.dataset.view)));
  $("#backup-button").addEventListener("click", downloadBackup);
  $("#logout-button").addEventListener("click", logout);
  $("#publish-button").addEventListener("click", publish);

  // static fields (profile, about text)
  document.addEventListener("input", (event) => {
    const field = event.target.closest("[data-bind]");
    if (!field || !state.content) return;
    setPath(state.content, field.dataset.bind, field.value);
    if (field.dataset.bind === "profile.name") renderSidebar();
    onContentChanged();
  });
  $$(".img-pick[data-image]").forEach((picker) => {
    const path = picker.dataset.image.split(".");
    const key = path.pop();
    setupPicker(picker, () => ({ obj: getPath(state.content, path.join(".")), key }));
  });

  // projects page
  $("#project-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderProjects();
  });
  $$('[data-action="add-project"]').forEach((button) => button.addEventListener("click", () => openProjectDialog(-1)));

  // project dialog
  const cover = $("#project-cover");
  cover.addEventListener("click", async () => setProjectCover(await pickFile("image/*")));
  makeDropZone(cover, setProjectCover);
  $("#project-form").addEventListener("submit", saveProjectDialog);
  $("#project-form").elements.category.addEventListener("change", (event) => {
    const input = $("#project-form").elements.newCategory;
    input.hidden = event.target.value !== "__new";
    if (!input.hidden) input.focus();
  });
  $$("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => $("#project-dialog").close()));
  confirmClick($("#project-delete"), () => {
    state.content.projects.splice(state.dialogIndex, 1);
    $("#project-dialog").close();
    refresh();
  });

  // categories page
  $("#add-category").addEventListener("click", addCategory);
  $("#new-category").addEventListener("keydown", (event) => event.key === "Enter" && addCategory());

  // profile page (CV)
  $("#cv-upload").addEventListener("click", uploadCv);
  confirmClick($("#cv-remove"), () => {
    state.content.profile.cv = "";
    renderProfile();
    onContentChanged();
  });

  // "Add" buttons under each list
  $$("[data-add]").forEach((button) =>
    button.addEventListener("click", () => {
      const key = button.dataset.add;
      state.content[key].push(deepCopy(BLANK_ITEMS[key]));
      refresh();
    }));

  // extra sections: on/off switches
  $$("[data-section-toggle]").forEach((toggle) =>
    toggle.addEventListener("change", () => {
      state.content.sections[toggle.dataset.sectionToggle] = toggle.checked;
      refresh();
    }));

  // certificates page
  const addCert = $("#add-cert");
  addCert.addEventListener("click", async () => addCertificate(await pickFile("image/*")));
  makeDropZone(addCert, addCertificate);

  // warn before closing with unpublished changes
  window.addEventListener("beforeunload", (event) => {
    if (state.content && hasChanges()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Cmd/Ctrl + S = Publish
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s" && state.content) {
      event.preventDefault();
      publish();
    }
  });
}


/* ==========================================================================
   12. START
   ========================================================================== */

(async function boot() {
  attachEvents();
  state.config = loadConfig();
  if (!state.config) return showLogin();

  showScreen("loading");
  try {
    await startDashboard();
  } catch (error) {
    showLogin(error.message);
  }
})();
