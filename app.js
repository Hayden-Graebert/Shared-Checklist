/*
  SETUP
  1. Create a Supabase project.
  2. Enable Authentication -> Providers -> Anonymous Sign-Ins and Email.
  3. For the simplest setup, leave email confirmation OFF while testing.
  4. Run supabase.sql in the SQL Editor.
  5. Paste your Supabase URL and publishable key below.

  The app supports guest sessions as well as permanent email/password accounts.
  Creating an account while using a guest session upgrades that same Supabase
  user, so existing guest checklists can stay attached to the account.
*/

const SUPABASE_URL = "https://eqkscgfdjgltoqmcgypy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_d7fOABKvJLIYT8F1OQQh0g_AKc0U_1g";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const welcomeView = document.getElementById("welcomeView");
const appView = document.getElementById("appView");
const welcomeError = document.getElementById("welcomeError");
const appError = document.getElementById("appError");
const newListButton = document.getElementById("newListButton");
const joinForm = document.getElementById("joinForm");
const sharedLinkInput = document.getElementById("sharedLinkInput");
const listTitle = document.getElementById("listTitle");
const saveState = document.getElementById("saveState");
const themeButton = document.getElementById("themeButton");
const shareButton = document.getElementById("shareButton");
const accountButton = document.getElementById("accountButton");
const appAccountButton = document.getElementById("appAccountButton");
const appAccountLabel = document.getElementById("appAccountLabel");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const signUpButton = document.getElementById("signUpButton");
const signInButton = document.getElementById("signInButton");
const signOutButton = document.getElementById("signOutButton");
const accountStatus = document.getElementById("accountStatus");
const accountHint = document.getElementById("accountHint");
const authError = document.getElementById("authError");
const myChecklists = document.getElementById("myChecklists");
const myChecklistList = document.getElementById("myChecklistList");
const refreshListsButton = document.getElementById("refreshListsButton");
const activityForm = document.getElementById("activityForm");
const activityInput = document.getElementById("activityInput");
const activityList = document.getElementById("activityList");
const filterButtons = Array.from(document.querySelectorAll(".filter-button"));
let activeActivityFilter = "all";
const emptyState = document.getElementById("emptyState");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");
const closeChecklistButton = document.getElementById("closeChecklistButton");
const toast = document.getElementById("toast");
const fireworksLayer = document.getElementById("fireworks");
const fireworksCanvas = document.getElementById("fireworksCanvas");
const fireworksCtx = fireworksCanvas.getContext("2d");

let currentList = null;
let activities = [];
let realtimeChannel = null;
let titleSaveTimer = null;
let toastTimer = null;
let fireworksFrame = null;

const themeStorageKey = "together-checklist-theme";

function configured() {
  return (
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("YOUR_") &&
    !SUPABASE_ANON_KEY.includes("YOUR_")
  );
}

function getTheme() {
  return localStorage.getItem(themeStorageKey) || "light";
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === "dark" ? "☀" : "☾";
  themeButton.title = theme === "dark" ? "Use light theme" : "Use dark theme";
  localStorage.setItem(themeStorageKey, theme);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function showWelcomeError(message) {
  welcomeError.textContent = message || "";
}

function showAuthError(message) {
  authError.textContent = message || "";
}

function showAppError(message) {
  appError.textContent = message || "";
}

function setSaveState(value) {
  saveState.textContent = value;
  saveState.classList.toggle("saving", value === "Saving…");
}

function getShareUrl() {
  if (!currentList) return window.location.href;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("list", currentList.id);
  url.searchParams.set("invite", currentList.invite_code);
  return url.toString();
}

function parseSharedLink(input) {
  try {
    const url = new URL(input);
    const listId = url.searchParams.get("list");
    const invite = url.searchParams.get("invite");
    if (!listId || !invite) return null;
    return { listId, invite };
  } catch {
    return null;
  }
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const listId = params.get("list");
  const invite = params.get("invite");
  return listId && invite ? { listId, invite } : null;
}

async function getSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data.session;
}

function isAnonymousSession(session) {
  return Boolean(session?.user?.is_anonymous);
}

async function ensureSession() {
  const session = await getSession();
  if (session) return session;

  const { data, error } = await supabaseClient.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}

function updateAccountUi(session) {
  const anonymous = isAnonymousSession(session);
  const email = session?.user?.email || "";

  if (!session) {
    accountStatus.textContent = "Signed out";
    accountHint.textContent = "Log in or create an account to recover your checklists on another device.";
    signUpButton.classList.remove("hidden");
    signInButton.classList.remove("hidden");
    signOutButton.classList.add("hidden");
    myChecklists.classList.add("hidden");
    appAccountLabel.textContent = "Signed out";
    return;
  }

  if (anonymous) {
    accountStatus.textContent = "Guest";
    accountHint.textContent = "You are using guest mode. Create an account here to keep this guest data and recover it on another device.";
    signUpButton.classList.remove("hidden");
    signInButton.classList.remove("hidden");
    signOutButton.classList.remove("hidden");
    appAccountLabel.textContent = "Guest mode";
  } else {
    accountStatus.textContent = "Account";
    accountHint.textContent = email ? `Signed in as ${email}. Your checklists are tied to this account.` : "You are signed in.";
    signUpButton.classList.add("hidden");
    signInButton.classList.add("hidden");
    signOutButton.classList.remove("hidden");
    appAccountLabel.textContent = email || "Signed in";
  }
}

async function upgradeGuestAccount(email, password) {
  const session = await ensureSession();
  if (!isAnonymousSession(session)) {
    throw new Error("You already have an account. Log out before creating another one.");
  }

  const { data, error } = await supabaseClient.auth.updateUser({ email, password });
  if (error) throw error;
  return data.user;
}

async function createAccount() {
  showAuthError("");
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) {
    showAuthError("Enter an email address and password.");
    return;
  }

  signUpButton.disabled = true;
  signUpButton.textContent = "Creating…";

  try {
    const session = await getSession();
    if (session && isAnonymousSession(session)) {
      await upgradeGuestAccount(email, password);
      showToast("Account created — your guest data was kept.");
    } else if (session) {
      throw new Error("You are already signed in. Log out first if you want a different account.");
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        showToast("Account created. Check your email to confirm it, then log in.");
      } else {
        showToast("Account created.");
      }
    }
    authPassword.value = "";
    await refreshAccountState();
  } catch (error) {
    console.error(error);
    showAuthError(error.message || "Could not create the account.");
  } finally {
    signUpButton.disabled = false;
    signUpButton.textContent = "Create account";
  }
}

async function signIn() {
  showAuthError("");
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) {
    showAuthError("Enter your email address and password.");
    return;
  }

  signInButton.disabled = true;
  signInButton.textContent = "Logging in…";

  try {
    const session = await getSession();
    if (session && isAnonymousSession(session)) {
      const proceed = window.confirm("You are currently using guest mode. Log in to a different account? Your current guest checklist will remain on this browser, but it will not be moved to the account. Use ‘Create account’ instead if you want to keep it.");
      if (!proceed) return;
      await supabaseClient.auth.signOut();
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    authPassword.value = "";
    showToast("Logged in.");
    await refreshAccountState();
  } catch (error) {
    console.error(error);
    showAuthError(error.message || "Could not log in.");
  } finally {
    signInButton.disabled = false;
    signInButton.textContent = "Log in";
  }
}

async function signOut() {
  showAuthError("");
  try {
    if (realtimeChannel) {
      await supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    await supabaseClient.auth.signOut();
    currentList = null;
    activities = [];
    appView.classList.add("hidden");
    welcomeView.classList.remove("hidden");
    clearUrlState();
    await refreshAccountState();
    showToast("Logged out.");
  } catch (error) {
    console.error(error);
    showAuthError(error.message || "Could not log out.");
  }
}

async function refreshAccountState() {
  const session = await getSession();
  updateAccountUi(session);
  if (session && !isAnonymousSession(session)) {
    await loadMyChecklists();
  } else {
    myChecklists.classList.add("hidden");
  }
}

async function loadMyChecklists() {
  myChecklistList.innerHTML = '<div class="my-checklist-empty">Loading your checklists…</div>';
  myChecklists.classList.remove("hidden");

  const { data: memberships, error: membershipError } = await supabaseClient
    .from("list_members")
    .select("list_id, created_at")
    .order("created_at", { ascending: false });

  if (membershipError) {
    console.error(membershipError);
    myChecklistList.innerHTML = `<div class="my-checklist-empty">${escapeHtml(membershipError.message || "Could not load your checklists.")}</div>`;
    return;
  }

  const ids = (memberships || []).map(row => row.list_id);
  if (!ids.length) {
    myChecklistList.innerHTML = '<div class="my-checklist-empty">No checklists yet. Create one below.</div>';
    return;
  }

  const { data: lists, error: listsError } = await supabaseClient
    .from("lists")
    .select("*")
    .in("id", ids)
    .order("updated_at", { ascending: false });

  if (listsError) {
    console.error(listsError);
    myChecklistList.innerHTML = `<div class="my-checklist-empty">${escapeHtml(listsError.message || "Could not load your checklists.")}</div>`;
    return;
  }

  const session = await getSession();
  const userId = session?.user?.id;
  myChecklistList.innerHTML = "";
  for (const list of lists || []) {
    const item = document.createElement("div");
    item.className = "my-checklist-item";

    const copy = document.createElement("div");
    copy.style.minWidth = "0";
    const name = document.createElement("div");
    name.className = "my-checklist-name";
    name.textContent = list.title;
    const date = document.createElement("div");
    date.className = "my-checklist-date";
    date.textContent = `Updated ${new Date(list.updated_at).toLocaleDateString()}`;
    copy.append(name, date);

    const actions = document.createElement("div");
    actions.className = "my-checklist-actions";

    const openButton = document.createElement("button");
    openButton.className = "button button-secondary";
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => openList(list.id, list.invite_code, list));
    actions.appendChild(openButton);

    if (userId && list.created_by === userId) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "button button-danger";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.setAttribute("aria-label", `Delete checklist ${list.title}`);
      deleteButton.addEventListener("click", () => deleteList(list, deleteButton));
      actions.appendChild(deleteButton);
    }

    item.append(copy, actions);
    myChecklistList.appendChild(item);
  }
}

async function deleteList(list, button) {
  const confirmed = window.confirm(
    `Permanently delete "${list.title}"?\n\nAll its activities will be deleted, and it will disappear for everyone sharing it. This cannot be undone.`
  );
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const { error } = await supabaseClient.rpc("delete_list", { p_list_id: list.id });
    if (error) throw error;
    showToast("Checklist deleted.");
    await loadMyChecklists();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not delete the checklist.");
    button.disabled = false;
    button.textContent = "Delete";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

function clearUrlState() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  history.replaceState({}, "", url);
}

async function createList() {
  showWelcomeError("");
  if (!configured()) {
    showWelcomeError("Add your Supabase URL and public key to app.js first.");
    return;
  }

  newListButton.disabled = true;
  newListButton.textContent = "Creating…";

  try {
    await ensureSession();
    const title = "Things We’ll Do Together";
    const { data: createdList, error: createError } = await supabaseClient.rpc("create_list", {
      p_title: title
    });
    if (createError) throw createError;
    const list = Array.isArray(createdList) ? createdList[0] : createdList;
    await openList(list.id, list.invite_code, list);
  } catch (error) {
    console.error(error);
    showWelcomeError(error.message || "Could not create the checklist.");
  } finally {
    newListButton.disabled = false;
    newListButton.textContent = "Create a new checklist";
  }
}

async function joinFromLink(listId, invite) {
  if (!configured()) {
    showWelcomeError("Add your Supabase URL and public key to app.js first.");
    return;
  }

  try {
    await ensureSession();
    const { data: joinedList, error } = await supabaseClient.rpc("join_list", {
      p_list_id: listId,
      p_invite_code: invite
    });
    if (error) throw error;
    const list = Array.isArray(joinedList) ? joinedList[0] : joinedList;
    await openList(listId, invite, list || null);
  } catch (error) {
    console.error(error);
    showWelcomeError(error.message || "That shared checklist link is invalid.");
    clearUrlState();
  }
}

async function openList(listId, invite, knownList = null) {
  showWelcomeError("");
  showAppError("");
  if (!configured()) {
    showWelcomeError("Add your Supabase URL and public key to app.js first.");
    return;
  }

  try {
    await ensureSession();

    if (!knownList) {
      const { data, error } = await supabaseClient
        .from("lists")
        .select("*")
        .eq("id", listId)
        .single();
      if (error) throw error;
      knownList = data;
    }

    if (invite) {
      const { data: joinedList, error: joinError } = await supabaseClient.rpc("join_list", {
        p_list_id: listId,
        p_invite_code: invite
      });
      if (!joinError && joinedList) {
        knownList = Array.isArray(joinedList) ? joinedList[0] : joinedList;
      } else if (joinError && !knownList) {
        throw joinError;
      }
    }

    currentList = knownList;
    const { data: activityRows, error: activityError } = await supabaseClient
      .from("activities")
      .select("*")
      .eq("list_id", listId)
      .order("created_at", { ascending: true });
    if (activityError) throw activityError;

    activities = activityRows || [];
    render();
    setAppUrl(listId, currentList.invite_code);
    await subscribeToRealtime();
    welcomeView.classList.add("hidden");
    appView.classList.remove("hidden");
    const session = await getSession();
    updateAccountUi(session);
    activityInput.focus();
  } catch (error) {
    console.error(error);
    showWelcomeError(error.message || "Could not open the checklist.");
    welcomeView.classList.remove("hidden");
    appView.classList.add("hidden");
  }
}

function setAppUrl(listId, invite) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("list", listId);
  url.searchParams.set("invite", invite);
  history.replaceState({}, "", url);
}

async function subscribeToRealtime() {
  if (!currentList) return;

  if (realtimeChannel) {
    await supabaseClient.removeChannel(realtimeChannel);
  }

  const listId = currentList.id;

  realtimeChannel = supabaseClient
    .channel(`together-${listId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "lists",
        filter: `id=eq.${listId}`
      },
      ({ new: updatedList }) => {
        if (!currentList) return;
        currentList = { ...currentList, ...updatedList };

        if (document.activeElement !== listTitle) {
          listTitle.value = currentList.title;
        }
        renderProgressOnly();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "activities",
        filter: `list_id=eq.${listId}`
      },
      ({ new: row }) => {
        if (activities.some(item => item.id === row.id)) return;
        activities = [...activities, row].sort(sortActivities);
        render();
        if (row.completed) launchFireworks();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "activities",
        filter: `list_id=eq.${listId}`
      },
      ({ old: oldRow, new: newRow }) => {
        const previous = activities.find(item => item.id === newRow.id);
        activities = activities
          .map(item => item.id === newRow.id ? newRow : item)
          .sort(sortActivities);
        render();

        if ((previous ? !previous.completed : !oldRow.completed) && newRow.completed) {
          launchFireworks();
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "activities",
        filter: `list_id=eq.${listId}`
      },
      ({ old }) => {
        activities = activities.filter(item => item.id !== old.id);
        render();
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSaveState("Saved");
      }
    });
}

function sortActivities(a, b) {
  // Completed activities rise to the top; retain creation order within each group.
  if (a.completed !== b.completed) return a.completed ? -1 : 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeActivityFilter = button.dataset.filter;
    filterButtons.forEach(other => {
      const selected = other === button;
      other.classList.toggle("active", selected);
      other.setAttribute("aria-pressed", String(selected));
    });
    render();
  });
});

function renderProgressOnly() {
  const total = activities.length;
  const completed = activities.filter(item => item.completed).length;
  const percentage = total ? Math.round((completed / total) * 100) : 0;
  progressText.textContent = `${completed} / ${total} complete`;
  progressBar.style.width = `${percentage}%`;
}

function render() {
  listTitle.value = currentList?.title || "";
  activityList.innerHTML = "";

  const sorted = [...activities]
    .filter(item => activeActivityFilter === "all" ||
      (activeActivityFilter === "completed" ? item.completed : !item.completed))
    .sort(sortActivities);

  for (const activity of sorted) {
    const item = document.createElement("article");
    item.className = `activity-item${activity.completed ? " completed" : ""}`;
    item.dataset.id = activity.id;

    const checkLabel = document.createElement("label");
    checkLabel.className = "activity-check";
    checkLabel.setAttribute("aria-label", `Mark "${activity.text}" ${activity.completed ? "incomplete" : "complete"}`);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = activity.completed;
    checkbox.addEventListener("change", () => toggleActivity(activity.id, checkbox.checked));

    const checkmark = document.createElement("span");
    checkmark.className = "checkmark";
    checkLabel.append(checkbox, checkmark);

    const text = document.createElement("div");
    text.className = "activity-text";
    text.textContent = activity.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.title = "Delete activity";
    deleteButton.setAttribute("aria-label", `Delete "${activity.text}"`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteActivity(activity.id));

    item.append(checkLabel, text, deleteButton);
    activityList.appendChild(item);
  }

  // The original empty state is for a genuinely empty checklist, not an empty filter.
  emptyState.classList.toggle("hidden", activities.length !== 0);
  if (activities.length && !sorted.length) {
    const message = document.createElement("p");
    message.className = "filter-empty-message";
    message.textContent = activeActivityFilter === "completed"
      ? "No completed activities yet."
      : "No incomplete activities to show.";
    activityList.appendChild(message);
  }
  renderProgressOnly();
}

async function addActivity(text) {
  if (!currentList || !text.trim()) return;

  const cleanText = text.trim();
  activityInput.value = "";
  setSaveState("Saving…");
  showAppError("");

  const { data, error } = await supabaseClient
    .from("activities")
    .insert({
      list_id: currentList.id,
      text: cleanText,
      completed: false
    })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    showAppError(error.message || "Could not add that activity.");
    setSaveState("Not saved");
    activityInput.value = cleanText;
    return;
  }

  if (!activities.some(item => item.id === data.id)) {
    activities = [...activities, data].sort(sortActivities);
    render();
  }
  setSaveState("Saved");
}

async function toggleActivity(id, completed) {
  setSaveState("Saving…");
  showAppError("");

  const previous = activities.find(item => item.id === id);
  activities = activities.map(item => item.id === id ? { ...item, completed } : item);
  render();

  const { error } = await supabaseClient
    .from("activities")
    .update({
      completed,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("list_id", currentList.id);

  if (error) {
    console.error(error);
    activities = activities.map(item => item.id === id ? { ...item, completed: previous?.completed ?? false } : item);
    render();
    showAppError(error.message || "Could not save that change.");
    setSaveState("Not saved");
    return;
  }

  setSaveState("Saved");
  if (!previous?.completed && completed) launchFireworks();
}

async function deleteActivity(id) {
  const activity = activities.find(item => item.id === id);
  if (!activity) return;

  setSaveState("Saving…");
  showAppError("");

  const { error } = await supabaseClient
    .from("activities")
    .delete()
    .eq("id", id)
    .eq("list_id", currentList.id);

  if (error) {
    console.error(error);
    showAppError(error.message || "Could not delete that activity.");
    setSaveState("Not saved");
    return;
  }

  activities = activities.filter(item => item.id !== id);
  render();
  setSaveState("Saved");
}

function scheduleTitleSave() {
  if (!currentList) return;
  clearTimeout(titleSaveTimer);
  setSaveState("Saving…");

  titleSaveTimer = setTimeout(async () => {
    const title = listTitle.value.trim().slice(0, 80) || "Things We’ll Do Together";

    const { error } = await supabaseClient
      .from("lists")
      .update({
        title,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentList.id);

    if (error) {
      console.error(error);
      showAppError(error.message || "Could not save the checklist name.");
      setSaveState("Not saved");
      return;
    }

    currentList.title = title;
    setSaveState("Saved");
  }, 450);
}

async function copyShareLink() {
  const link = getShareUrl();

  try {
    await navigator.clipboard.writeText(link);
    showToast("Share link copied.");
  } catch {
    const temp = document.createElement("textarea");
    temp.value = link;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    temp.remove();
    showToast("Share link copied.");
  }
}

function closeChecklist() {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  currentList = null;
  activities = [];
  appView.classList.add("hidden");
  welcomeView.classList.remove("hidden");
  welcomeError.textContent = "";
  showAppError("");
  clearUrlState();
  refreshAccountState().catch(console.error);
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fireworksCanvas.width = Math.floor(window.innerWidth * dpr);
  fireworksCanvas.height = Math.floor(window.innerHeight * dpr);
  fireworksCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function launchFireworks() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const bursts = [
    { x: width * 0.28, y: height * 0.32, delay: 0 },
    { x: width * 0.70, y: height * 0.27, delay: 130 },
    { x: width * 0.50, y: height * 0.20, delay: 260 }
  ];

  fireworksLayer.classList.add("show");

  let particles = [];
  let rockets = [];
  let start = performance.now();

  const colors = [
    { r: 255, g: 240, b: 220 },
    { r: 255, g: 210, b: 150 },
    { r: 225, g: 235, b: 255 },
    { r: 255, g: 170, b: 190 },
    { r: 190, g: 225, b: 255 }
  ];

  function spawnRocket(targetX, targetY, delay) {
    rockets.push({
      x: targetX,
      y: height + 30,
      tx: targetX,
      ty: targetY,
      born: performance.now() + delay,
      launched: false
    });
  }

  bursts.forEach(b => spawnRocket(b.x, b.y, b.delay));

  function explode(x, y) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    const count = 72 + Math.floor(Math.random() * 30);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.6;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 46 + Math.random() * 34,
        size: 1.0 + Math.random() * 1.7,
        alpha: 0.86 + Math.random() * 0.14,
        color
      });
    }

    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 1.6;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 85 + Math.random() * 40,
        size: 0.7 + Math.random(),
        alpha: 0.42,
        color: { r: 255, g: 255, b: 255 }
      });
    }
  }

  function tick(now) {
    const elapsed = now - start;

    fireworksCtx.clearRect(0, 0, width, height);

    rockets = rockets.filter(rocket => {
      if (now < rocket.born) return true;

      if (!rocket.launched) {
        rocket.launched = true;
        rocket.x = rocket.tx;
        rocket.y = height + 30;
      }

      const dy = rocket.ty - rocket.y;
      rocket.y += Math.max(-9, dy * 0.05);
      rocket.x = rocket.tx;

      if (Math.abs(dy) < 12) {
        explode(rocket.tx, rocket.ty);
        return false;
      }

      fireworksCtx.beginPath();
      fireworksCtx.arc(rocket.x, rocket.y, 1.6, 0, Math.PI * 2);
      fireworksCtx.fillStyle = "rgba(255,255,255,0.9)";
      fireworksCtx.fill();
      return true;
    });

    particles = particles.filter(particle => {
      particle.life += 1;
      particle.vx *= 0.988;
      particle.vy = particle.vy * 0.988 + 0.045;
      particle.x += particle.vx;
      particle.y += particle.vy;

      const remaining = 1 - particle.life / particle.maxLife;
      const alpha = Math.max(0, remaining) * particle.alpha;

      fireworksCtx.beginPath();
      fireworksCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      fireworksCtx.fillStyle = `rgba(${particle.color.r},${particle.color.g},${particle.color.b},${alpha})`;
      fireworksCtx.fill();

      return particle.life < particle.maxLife;
    });

    if (elapsed < 2200 || particles.length > 0 || rockets.length > 0) {
      fireworksFrame = requestAnimationFrame(tick);
    } else {
      fireworksLayer.classList.remove("show");
      fireworksCtx.clearRect(0, 0, width, height);
      fireworksFrame = null;
    }
  }

  if (fireworksFrame) cancelAnimationFrame(fireworksFrame);
  fireworksFrame = requestAnimationFrame(tick);
}

newListButton.addEventListener("click", createList);
signUpButton.addEventListener("click", createAccount);
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await signIn();
});
signOutButton.addEventListener("click", signOut);
refreshListsButton.addEventListener("click", loadMyChecklists);
accountButton.addEventListener("click", () => {
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  currentList = null;
  activities = [];
  welcomeView.classList.remove("hidden");
  appView.classList.add("hidden");
  clearUrlState();
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshAccountState().catch(console.error);
});
appAccountButton.addEventListener("click", () => {
  if (currentList) {
    if (realtimeChannel) {
      supabaseClient.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    currentList = null;
    activities = [];
  }
  appView.classList.add("hidden");
  welcomeView.classList.remove("hidden");
  clearUrlState();
  refreshAccountState().catch(console.error);
  window.scrollTo({ top: 0, behavior: "smooth" });
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showWelcomeError("");
  const shared = parseSharedLink(sharedLinkInput.value.trim());
  if (!shared) {
    showWelcomeError("Paste a valid shared checklist link.");
    return;
  }
  const button = joinForm.querySelector("button");
  button.disabled = true;
  button.textContent = "Opening…";
  try {
    await joinFromLink(shared.listId, shared.invite);
  } finally {
    button.disabled = false;
    button.textContent = "Open checklist";
  }
});

themeButton.addEventListener("click", () => {
  setTheme(getTheme() === "dark" ? "light" : "dark");
});
shareButton.addEventListener("click", copyShareLink);
activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addActivity(activityInput.value);
});
listTitle.addEventListener("input", scheduleTitleSave);
listTitle.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    listTitle.blur();
  }
});
closeChecklistButton.addEventListener("click", closeChecklist);
window.addEventListener("resize", resizeCanvas);

supabaseClient.auth.onAuthStateChange((_event, session) => {
  updateAccountUi(session);
  if (session && !isAnonymousSession(session) && !currentList) {
    loadMyChecklists().catch(console.error);
  }
});

async function boot() {
  setTheme(getTheme());
  resizeCanvas();
  if (!configured()) {
    showWelcomeError("Add your Supabase URL and public key to app.js, then reload.");
    return;
  }

  try {
    const session = await getSession();
    updateAccountUi(session);
    const urlState = readUrlState();
    if (urlState) {
      await joinFromLink(urlState.listId, urlState.invite);
    } else if (session && !isAnonymousSession(session)) {
      await loadMyChecklists();
    }
  } catch (error) {
    console.error(error);
    showWelcomeError(error.message || "Could not start the app.");
  }
}

boot();
