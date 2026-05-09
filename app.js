// ===== 1. Firebase init =====
/*const firebaseConfig = {
  apiKey: "AIzaSyBwyKPe1Cvqf9swwGJXD9SewTgvYz3l3Tc",
  authDomain: "pokerplanning-rajopanth.firebaseapp.com",
  databaseURL: "https://pokerplanning-rajopanth-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pokerplanning-rajopanth",
  storageBucket: "pokerplanning-rajopanth.firebasestorage.app",
  messagingSenderId: "614873381520",
  appId: "1:614873381520:web:f498d924354cc1ecf27615"
};
*/
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== 2. Simple state =====
const FIB_DECK = ["0", "1", "2", "3", "5", "8", "13", "21"];

let currentRoomId = null;
let currentParticipantId = null;
let isModerator = false;
let currentVote = null;

// ===== 3. DOM refs =====
const nameInput = document.getElementById("name-input");
const roomInput = document.getElementById("room-input");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");

const authPanel = document.getElementById("auth-panel");
const roomPanel = document.getElementById("room-panel");
const roomTitle = document.getElementById("room-title");
const roomStatusEl = document.getElementById("room-status");
const userRoleEl = document.getElementById("user-role");
const shareLinkEl = document.getElementById("share-link");
const moderatorControls = document.getElementById("moderator-controls");
const revealBtn = document.getElementById("reveal-btn");
const resetBtn = document.getElementById("reset-btn");
const cardsContainer = document.getElementById("cards-container");
const participantsList = document.getElementById("participants-list");

// ===== 4. Helpers =====
function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function renderCards(status) {
  cardsContainer.innerHTML = "";
  FIB_DECK.forEach((value) => {
    const btn = document.createElement("div");
    btn.className = "card" + (currentVote === value ? " selected" : "");
    btn.textContent = value;
    btn.onclick = () => castVote(value, status);
    cardsContainer.appendChild(btn);
  });
}

function updateShareLink(roomId) {
  const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
  shareLinkEl.textContent = url;
}

// ===== 5. Firestore operations =====
async function createRoom(name) {
  const roomId = roomInput.value.trim() || randomRoomCode();
  const roomRef = db.collection("rooms").doc(roomId);

  await roomRef.set({
    status: "voting",
    createdAt: Date.now(),
  });

  const participantRef = await roomRef.collection("participants").add({
    name,
    isModerator: true,
    vote: null,
  });

  currentRoomId = roomId;
  currentParticipantId = participantRef.id;
  isModerator = true;
  currentVote = null;

  enterRoom(roomId);
}

async function joinRoom(name, roomId) {
  const roomRef = db.collection("rooms").doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    alert("Room not found");
    return;
  }

  const participantRef = await roomRef.collection("participants").add({
    name,
    isModerator: false,
    vote: null,
  });

  currentRoomId = roomId;
  currentParticipantId = participantRef.id;
  isModerator = false;
  currentVote = null;

  enterRoom(roomId);
}

async function castVote(value, status) {
  if (!currentRoomId || !currentParticipantId) return;
  if (status === "revealed") return; // lock after reveal

  const roomRef = db.collection("rooms").doc(currentRoomId);
  const participantRef = roomRef.collection("participants").doc(currentParticipantId);

  await participantRef.update({ vote: value });
  currentVote = value;
  renderCards(status);
}

async function revealVotes() {
  if (!isModerator || !currentRoomId) return;
  const roomRef = db.collection("rooms").doc(currentRoomId);
  await roomRef.update({ status: "revealed" });
}

async function resetVotes() {
  if (!isModerator || !currentRoomId) return;
  const roomRef = db.collection("rooms").doc(currentRoomId);
  const participantsSnap = await roomRef.collection("participants").get();

  const batch = db.batch();
  participantsSnap.forEach((doc) => {
    batch.update(doc.ref, { vote: null });
  });
  batch.update(roomRef, { status: "voting" });
  await batch.commit();
  currentVote = null;
}

// ===== 6. Subscriptions =====
let unsubscribeRoom = null;
let unsubscribeParticipants = null;

function enterRoom(roomId) {
  authPanel.style.display = "none";
  roomPanel.style.display = "block";
  roomTitle.textContent = `Room ${roomId}`;
  userRoleEl.textContent = isModerator ? "Moderator" : "Participant";
  moderatorControls.style.display = isModerator ? "block" : "none";
  updateShareLink(roomId);

  if (unsubscribeRoom) unsubscribeRoom();
  if (unsubscribeParticipants) unsubscribeParticipants();

  const roomRef = db.collection("rooms").doc(roomId);

  unsubscribeRoom = roomRef.onSnapshot((snap) => {
    const data = snap.data();
    if (!data) return;
    roomStatusEl.textContent = data.status;
    renderCards(data.status);
  });

  unsubscribeParticipants = roomRef
    .collection("participants")
    .onSnapshot((snap) => {
      participantsList.innerHTML = "";
      snap.forEach((doc) => {
        const p = doc.data();
        const li = document.createElement("li");
        const isSelf = doc.id === currentParticipantId;
        const label = isSelf ? `${p.name} (you)` : p.name;
        const role = p.isModerator ? " [M]" : "";
        let voteDisplay = "…";
        if (p.vote && roomStatusEl.textContent === "revealed") {
          voteDisplay = p.vote;
        } else if (p.vote) {
          voteDisplay = "voted";
        }
        li.textContent = `${label}${role} – ${voteDisplay}`;
        participantsList.appendChild(li);
      });
    });
}

// ===== 7. Event listeners =====
createRoomBtn.onclick = () => {
  const name = nameInput.value.trim();
  if (!name) return alert("Enter your name");
  createRoom(name);
};

joinRoomBtn.onclick = () => {
  const name = nameInput.value.trim();
  const roomId = roomInput.value.trim().toUpperCase();
  if (!name) return alert("Enter your name");
  if (!roomId) return alert("Enter a room code");
  joinRoom(name, roomId);
};

revealBtn.onclick = revealVotes;
resetBtn.onclick = resetVotes;

// ===== 8. Auto-join if ?room=CODE in URL =====
(function autoJoinFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  if (room) {
    roomInput.value = room.toUpperCase();
  }
})();
