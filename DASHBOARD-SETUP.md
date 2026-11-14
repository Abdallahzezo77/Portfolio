# Portfolio Dashboard — Setup (one time, ~5 minutes)

Your site now reads all its content from `data/content.js`.
The dashboard at `/admin` edits that file and uploads images straight to your GitHub repo.
GitHub Pages then rebuilds your site automatically. No server, no database, free.

## 1. Upload this folder to your GitHub repo
Replace the files in your portfolio repo with the contents of this folder
(drag & drop on github.com → "Add file" → "Upload files", or with git / GitHub Desktop).
New files: `admin/`, `data/content.js`, `assets/js/render.js`. Changed: `index.html` (3 lines near the end).

## 2. Create a GitHub token (your dashboard "password")
1. Go to https://github.com/settings/personal-access-tokens/new
2. Repository access → **Only select repositories** → choose your portfolio repo
3. Permissions → Repository permissions → **Contents: Read and write**
4. Generate and copy the token (starts with `github_pat_`)

## 3. Open the dashboard
`https://YOUR-USERNAME.github.io/YOUR-REPO/admin/`
Paste the token and click Connect (username and repo fill in automatically).

## Using it
- Edit anything → press **Publish** (or Cmd/Ctrl + S).
- The live site updates in 1–2 minutes (sometimes up to 10 because of browser cache; hard-refresh with Cmd+Shift+R).
- Projects: add / edit / hide (draft) / reorder / delete, set cover image, link, category.
- Categories: add, rename (projects follow), delete (choose where its projects go).
- Profile: photo, name, title, email, phone, location, CV PDF.
- Social links: Dribbble, Behance, LinkedIn, GitHub, Instagram, X, YouTube, WhatsApp, TikTok, Figma, website…
- About text & services, certificates, education, experience, skills.
- Images are resized and converted to WebP automatically.
- "Download backup" saves a copy of all your content.

## Security
- The token can only touch this one repo. Never share it. If it leaks, delete it on GitHub and make a new one.
- Use "Log out" on shared computers.
