# Kahwin Cam 📸

A wedding photo booth web app. Guests scan the QR code on their goodies, take
photos of the majlis from their own point of view, and every photo goes straight
to the pengantin's Google Drive.

No app download, no login, RM0.

## Features
- Frames: 6 built-in frames (Emas Klasik, Bunga, Songket, Polaroid, Moden, Tanpa Bingkai), plus your own Canva frames
- Filters: Asal, Ceria, Hangat, Lembut, Vintaj, Hitam Putih, Sepia
- Single, 2-grid or 4-grid photos, each with a 3-2-1 countdown
- Pick photos from the gallery instead of using the camera
- Save the photo to the guest's own phone
- Guests can delete their own uploads but nobody else's
- Background music (built-in music-box tune or your own mp3)

## Stack
| Part | Tech |
|---|---|
| UI | HTML, CSS, JavaScript (no build step) |
| Camera | `getUserMedia` + HTML Canvas for frames, filters, grids |
| Music | Web Audio API |
| Backend | Google Apps Script ([apps-script/Code.gs](apps-script/Code.gs)) |
| Storage | Google Drive |
| Hosting | GitHub Pages |

## 1. Customise
Edit [js/config.js](js/config.js) to set the couple's names, the date and the hashtag.

## 2. Backend: Google Apps Script
1. Log in with the pengantin's Google account and go to <https://script.google.com>. Click **New project**.
2. Delete the sample code and paste in the contents of `apps-script/Code.gs`.
3. Pick `setup` from the function dropdown and click **▶ Run**. Approve the permissions when asked.
   This creates the Drive folder **"Kahwin Cam - Gambar Tetamu"**, and the log shows its link.
   *(If you'd rather use an existing folder, put its ID in `FOLDER_ID` first.)*
4. Click **Deploy → New deployment → Web app** and set:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web app URL (`https://script.google.com/macros/s/.../exec`) and paste it into
   `scriptUrl` in `js/config.js`.

> If you change `Code.gs` later, go to **Deploy → Manage deployments → Edit → Version: New version**
> so the URL stays the same.

## 3. Host on GitHub Pages
1. Create a GitHub repo and push this folder to it.
2. Go to **Settings → Pages**, set Source to **Deploy from a branch**, pick **main** and **/ (root)**.
3. Your app will be live at `https://<username>.github.io/<repo>/`.

The camera only works over **https**, which GitHub Pages gives you for free.

## 4. QR code for the goodies
Open `https://<username>.github.io/<repo>/qr.html` to get printable A4 tags with a QR code
and the couple's names. Click **Cetak** to print them.

## Optional extras
**Canva frames:** design at **1080 × 1440 px**, leave a transparent hole where the photo goes,
and export as PNG. Put the file in a `frames/` folder, then add it to `customFrames` in the config:
```js
customFrames: [
  { name: "Canva", src: "frames/frame1.png", area: { x: 60, y: 60, w: 960, h: 1080 } },
],
```
`area` is the position and size of the hole. For 2-grid and 4-grid, the photos are split inside that area.

**Your own music:** put an mp3 in a `music/` folder and set `musicUrl: "music/lagu.mp3"`.
Make sure you have the rights to use the song.

## Run locally
```bash
npx serve .
```
Then open <http://localhost:3000>. `localhost` counts as secure, so the camera works there.
To test on your phone over Wi-Fi you'll need https. The simplest way is to just push to GitHub Pages.

## How "delete only your own" works
When a photo is uploaded, the phone creates a random secret token and keeps it in `localStorage`.
The server only stores a SHA-256 hash of that token in the Drive file's description.
To delete a photo you need the original token, so only the phone that uploaded it can delete it.
Deleted photos go to the Drive Bin, so the pengantin can still restore them for 30 days.
