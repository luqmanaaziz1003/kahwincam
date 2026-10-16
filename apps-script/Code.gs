/**
 * KAHWIN CAM — Google Apps Script backend
 *
 * Receives photos from the web app and saves them into a Google Drive folder.
 * Each upload stores a SHA-256 hash of a secret token that only the guest's
 * phone knows, so guests can delete their own photos but nobody else's.
 *
 * Setup: see README.md ("Backend: Google Apps Script").
 */

// Optional: paste a Drive folder ID here. If left empty, running setup()
// creates a folder called "Kahwin Cam - Gambar Tetamu" for you.
const FOLDER_ID = '';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per photo

/** Run this once from the editor (▶ Run) to authorise Drive and create the folder. */
function setup() {
  const folder = getFolder_();
  Logger.log('Photos will be saved to: ' + folder.getUrl());
}

function doGet() {
  return json_({ ok: true, app: 'KahwinCam' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action === 'upload') return json_(upload_(req));
    if (req.action === 'delete') return json_(delete_(req));
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function upload_(req) {
  if (!req.image || !req.token || String(req.token).length < 16) {
    return { ok: false, error: 'bad_request' };
  }
  const bytes = Utilities.base64Decode(req.image);
  if (bytes.length > MAX_BYTES) return { ok: false, error: 'too_large' };

  const mime = req.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const guest = String(req.guest || '')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 40);
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const rand = Math.random().toString(36).slice(2, 6);
  const name = stamp + (guest ? '_' + guest : '') + '_' + rand + '.' + ext;

  const file = getFolder_().createFile(Utilities.newBlob(bytes, mime, name));
  file.setDescription('kc:' + hash_(req.token));
  return { ok: true, id: file.getId(), name: name };
}

function delete_(req) {
  if (!req.id || !req.token) return { ok: false, error: 'bad_request' };

  let file;
  try {
    file = DriveApp.getFileById(String(req.id));
  } catch (err) {
    return { ok: false, error: 'not_found' };
  }

  // Only files inside the Kahwin Cam folder can ever be deleted
  const folderId = getFolder_().getId();
  let inFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) inFolder = true;
  }
  if (!inFolder) return { ok: false, error: 'not_found' };
  if (file.isTrashed()) return { ok: true, already: true };

  if (file.getDescription() !== 'kc:' + hash_(req.token)) {
    return { ok: false, error: 'forbidden' };
  }
  file.setTrashed(true); // goes to Bin, recoverable for 30 days
  return { ok: true };
}

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = FOLDER_ID || props.getProperty('FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  const folder = DriveApp.createFolder('Kahwin Cam - Gambar Tetamu');
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function hash_(s) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return digest.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
