/* Private activity photos. Loaded before app.js; functions run after app boot. */
const ACTIVITY_PHOTO_BUCKET = "activity-photos";
const MAX_ACTIVITY_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const expandedPhotoActivities = new Set();
const uploadingPhotoActivities = new Set();
const activityPhotoStates = new Map();
let photoRequestCounter = 0;

function resetActivityPhotoState() {
  expandedPhotoActivities.clear();
  activityPhotoStates.clear();
}

function getActivityPhotoState(id) {
  if (!activityPhotoStates.has(id)) activityPhotoStates.set(id, {
    files: [], loading: false, error: "", uploadMessage: "", requestId: 0, expiresAt: 0
  });
  return activityPhotoStates.get(id);
}

function toggleActivityPhotos(id) {
  const activity = activities.find(item => item.id === id);
  if (!currentList || !activity?.completed) return;
  if (expandedPhotoActivities.has(id)) {
    expandedPhotoActivities.delete(id);
    render();
  } else {
    expandedPhotoActivities.add(id);
    render();
    loadActivityPhotos(id);
  }
}

function createActivityPhotoPanel(activity) {
  const panel = document.createElement("section");
  panel.id = `activity-photos-${activity.id}`;
  panel.className = "activity-photo-panel";
  panel.hidden = !expandedPhotoActivities.has(activity.id);
  panel.setAttribute("aria-label", `Photos for ${activity.text}`);
  if (panel.hidden) return panel;
  const state = getActivityPhotoState(activity.id);
  const uploading = uploadingPhotoActivities.has(activity.id);
  const toolbar = document.createElement("div");
  toolbar.className = "photo-toolbar";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp,image/gif";
  input.multiple = true;
  input.hidden = true;
  input.setAttribute("aria-label", `Attach photos to ${activity.text}`);
  const attach = document.createElement("button");
  attach.type = "button";
  attach.className = "attach-photos-button";
  attach.textContent = uploading ? "Uploading…" : "Attach photos";
  attach.disabled = uploading || pendingActivityUpdates.has(activity.id);
  attach.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    input.value = "";
    if (files.length) uploadActivityPhotos(activity.id, files);
  });
  const hint = document.createElement("span");
  hint.className = "photo-hint";
  hint.textContent = "JPG, PNG, WebP or GIF · up to 10 MB each";
  toolbar.append(attach, input, hint);
  panel.appendChild(toolbar);
  if (state.loading || state.uploadMessage || state.error) {
    const status = document.createElement("p");
    status.className = state.error ? "photo-status error-text" : "photo-status";
    status.setAttribute("role", state.error ? "alert" : "status");
    status.textContent = state.error || state.uploadMessage || "Loading photos…";
    panel.appendChild(status);
    if (state.error && !uploading) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "text-button";
      retry.textContent = "Reload photos";
      retry.addEventListener("click", () => loadActivityPhotos(activity.id));
      panel.appendChild(retry);
    }
  }
  const grid = document.createElement("div");
  grid.className = "activity-photo-grid";
  state.files.forEach((photo, index) => {
    const link = document.createElement("a");
    link.className = "activity-photo-link";
    link.href = photo.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `Open photo ${index + 1} for ${activity.text}`);
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = `${activity.text} — photo ${index + 1}`;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      img.hidden = true;
      link.textContent = "Photo unavailable — close and reopen this activity to retry.";
    }, { once: true });
    link.appendChild(img);
    grid.appendChild(link);
  });
  panel.appendChild(grid);
  if (!state.files.length && !state.loading && !state.error && !uploading) {
    const empty = document.createElement("p");
    empty.className = "photo-empty";
    empty.textContent = "No photos attached yet.";
    panel.appendChild(empty);
  }
  return panel;
}

function refreshActivityPhotoPanel(id, listId) {
  if (currentList?.id !== listId) return;
  const activity = activities.find(item => item.id === id && item.completed);
  const existing = document.getElementById(`activity-photos-${id}`);
  if (activity && existing) existing.replaceWith(createActivityPhotoPanel(activity));
}

async function listActivityPhotoFiles(listId, activityId) {
  const folder = `${listId}/${activityId}`;
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabaseClient.storage.from(ACTIVITY_PHOTO_BUCKET)
      .list(folder, { limit: 100, offset, sortBy: { column: "created_at", order: "asc" } });
    if (error) throw error;
    const page = data || [];
    for (const file of page) if (file.id) files.push({ ...file, path: `${folder}/${file.name}` });
    if (page.length < 100) break;
  }
  return files;
}

async function loadActivityPhotos(id) {
  if (!currentList || !expandedPhotoActivities.has(id)) return;
  const listId = currentList.id;
  const state = getActivityPhotoState(id);
  const requestId = ++photoRequestCounter;
  state.requestId = requestId;
  state.loading = true;
  state.error = "";
  refreshActivityPhotoPanel(id, listId);
  try {
    const files = await listActivityPhotoFiles(listId, id);
    const signed = [];
    for (let start = 0; start < files.length; start += 100) {
      const paths = files.slice(start, start + 100).map(file => file.path);
      const { data, error } = await supabaseClient.storage.from(ACTIVITY_PHOTO_BUCKET)
        .createSignedUrls(paths, 3600);
      if (error) throw error;
      for (const entry of data || []) {
        if (entry.error || !entry.signedUrl) throw new Error("Some photos could not be opened. Try reloading photos.");
        signed.push({ path: entry.path, url: entry.signedUrl });
      }
    }
    if (activityPhotoStates.get(id) !== state || state.requestId !== requestId) return;
    state.files = signed;
    state.expiresAt = Date.now() + 50 * 60 * 1000;
  } catch (error) {
    if (activityPhotoStates.get(id) !== state || state.requestId !== requestId) return;
    state.error = photoErrorMessage(error);
  } finally {
    if (activityPhotoStates.get(id) === state && state.requestId === requestId) {
      state.loading = false;
      refreshActivityPhotoPanel(id, listId);
    }
  }
}

function photoErrorMessage(error) {
  const message = error?.message || "Could not load or save photos.";
  if (/bucket.*not found|bucket.*does not exist/i.test(message)) {
    return "Photo storage is not set up yet. Run update-activity-photos.sql in Supabase, then reload.";
  }
  return message;
}

function activityPhotoMime(file) {
  if (PHOTO_TYPES[file.type]) return file.type;
  if (file.type) return null;
  const extension = file.name.split(".").pop().toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" })[extension] || null;
}

async function uploadActivityPhotos(id, files) {
  const activity = activities.find(item => item.id === id);
  if (!currentList || !activity?.completed || pendingActivityUpdates.has(id) || uploadingPhotoActivities.has(id)) return;
  const listId = currentList.id;
  const userId = currentUserId;
  const state = getActivityPhotoState(id);
  const errors = [];
  const valid = files.filter(file => {
    if (!activityPhotoMime(file)) { errors.push(`${file.name}: use JPG, PNG, WebP or GIF (convert HEIC first).`); return false; }
    if (!file.size || file.size > MAX_ACTIVITY_PHOTO_BYTES) { errors.push(`${file.name}: must be between 1 byte and 10 MB.`); return false; }
    return true;
  });
  if (!valid.length) { state.error = errors.join(" "); refreshActivityPhotoPanel(id, listId); return; }
  uploadingPhotoActivities.add(id);
  state.error = "";
  state.uploadMessage = `Uploading 1 of ${valid.length}…`;
  render();
  let uploaded = 0;
  try {
    for (let index = 0; index < valid.length; index++) {
      if (currentUserId !== userId) { errors.push("Upload stopped because the signed-in account changed."); break; }
      const file = valid[index];
      const mime = activityPhotoMime(file);
      state.uploadMessage = `Uploading ${index + 1} of ${valid.length}…`;
      refreshActivityPhotoPanel(id, listId);
      const path = `${listId}/${id}/${crypto.randomUUID()}.${PHOTO_TYPES[mime]}`;
      try {
        const { error } = await supabaseClient.storage.from(ACTIVITY_PHOTO_BUCKET)
          .upload(path, file, { contentType: mime, upsert: false, cacheControl: "3600" });
        if (error) throw error;
        uploaded++;
      } catch (error) {
        errors.push(`${file.name}: ${photoErrorMessage(error)}`);
      }
    }
    if (uploaded) {
      // Notify other open checklists through the existing activity subscription.
      // This changes neither completed nor completed_at.
      const { error } = await supabaseClient.from("activities")
        .update({ updated_at: new Date().toISOString() }).eq("id", id).eq("list_id", listId);
      if (error) errors.push("Photos were saved, but live refresh failed. Reopen the activity to see them.");
    }
  } catch (error) {
    errors.push(photoErrorMessage(error));
  } finally {
    uploadingPhotoActivities.delete(id);
    state.uploadMessage = "";
    if (currentList?.id === listId && activityPhotoStates.get(id) === state) {
      await loadActivityPhotos(id);
      state.error = [state.error, ...errors].filter(Boolean).join(" ");
      render();
      if (uploaded) showToast(`${uploaded} photo${uploaded === 1 ? "" : "s"} attached`);
    }
  }
}

async function removeActivityPhotos(listId, id) {
  const files = await listActivityPhotoFiles(listId, id);
  for (let start = 0; start < files.length; start += 100) {
    const { error } = await supabaseClient.storage.from(ACTIVITY_PHOTO_BUCKET)
      .remove(files.slice(start, start + 100).map(file => file.path));
    if (error) throw error;
  }
}

async function removeChecklistPhotos(listId) {
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseClient.from("activities")
      .select("id").eq("list_id", listId).order("id").range(offset, offset + 499);
    if (error) throw error;
    for (const activity of data || []) await removeActivityPhotos(listId, activity.id);
    if (!data || data.length < 500) break;
  }
}

// Renew temporary links for long-lived open panels and after returning to a tab.
function refreshExpiredActivityPhotos() {
  if (typeof currentList === "undefined" || !currentList || document.hidden) return;
  for (const id of expandedPhotoActivities) {
    const state = activityPhotoStates.get(id);
    if (state && !state.loading && state.files.length && Date.now() >= state.expiresAt) loadActivityPhotos(id);
  }
}
document.addEventListener("visibilitychange", refreshExpiredActivityPhotos);
setInterval(refreshExpiredActivityPhotos, 60 * 1000);
