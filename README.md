# Chinawalaa: deploy on Netlify

Folder layout
- public/index.html  -> your store
- public/admin.html  -> your private control panel (yourdomain.com/admin.html)
- netlify/functions/api.mjs -> the database + order API (uses Netlify Blobs, nothing else to sign up for)

## 1. Deploy (needs Git or the CLI; drag-and-drop will NOT run the database function)
1. Create a free GitHub account and a new private repository, then upload this whole folder to it.
2. Netlify > Add new site > Import an existing project > pick the repository. Leave build settings as they are > Deploy.

## 2. Set your admin password
Netlify > Site configuration > Environment variables > Add `ADMIN_PASSWORD` (long and unique). Then Deploys > Trigger deploy.

## 3. Connect your domain
Netlify > Domain management > Add a domain > enter your domain. Then either
- change the domain's nameservers at your registrar to the ones Netlify shows (easiest), or
- add the A / CNAME records Netlify shows. HTTPS is enabled automatically.

## 4. Use it
Open yourdomain.com/admin.html, log in, then:
- Products: edit name, price, sale price, stock, photo; add or delete products. Save changes.
- Page details: announcement, headline, email, WhatsApp, delivery charges, payment details, "coming soon" categories.
- Orders: every checkout is stored here with a status. CSV download available.
- Email list: people who asked to be notified.
