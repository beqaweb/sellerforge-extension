import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import { log, TERMINAL_STATUSES } from "../shared/constants";
import { getRawUser, initFirebase } from "./auth";

let db = null;

function getDb() {
  if (db) return db;
  initFirebase();
  db = firebase.firestore();
  return db;
}

function ordersCollection() {
  const user = getRawUser();
  if (!user) throw new Error("Not authenticated");
  return getDb().collection("users").doc(user.uid).collection("orders");
}

export async function saveOrderState(orderData) {
  const { orderId, ...rest } = orderData;
  if (!orderId) throw new Error("orderId is required");

  const docRef = ordersCollection().doc(orderId);
  const doc = await docRef.get();
  const now = new Date().toISOString();

  if (doc.exists) {
    await docRef.update({ ...rest, updatedAt: now, lastCheckedAt: now });
  } else {
    await docRef.set({
      orderId,
      ...rest,
      createdAt: now,
      updatedAt: now,
      lastCheckedAt: now,
    });
  }
}

export async function getOrderStates(orderIds) {
  if (!orderIds || orderIds.length === 0) return new Map();

  const col = ordersCollection();
  const result = new Map();
  const batchSize = 30;

  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const snapshot = await col.where("orderId", "in", batch).get();
    snapshot.forEach((doc) => result.set(doc.id, doc.data()));
  }

  return result;
}

export async function getSkippableOrderIds(orderIds) {
  const states = await getOrderStates(orderIds);
  const skippable = new Set();

  states.forEach((data, orderId) => {
    if (TERMINAL_STATUSES.includes(data.status)) {
      skippable.add(orderId);
    }
  });

  return skippable;
}

export async function clearAllOrderStates() {
  const col = ordersCollection();
  const batchSize = 100;

  let snapshot = await col.limit(batchSize).get();

  while (!snapshot.empty) {
    const batch = getDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    snapshot = await col.limit(batchSize).get();
  }
}

export async function getRequestedOrders() {
  const col = ordersCollection();
  const snapshot = await col
    .where("status", "==", "requested")
    .orderBy("lastRequestedAt", "desc")
    .limit(100)
    .get();

  const orders = [];
  snapshot.forEach((doc) => orders.push(doc.data()));
  return orders;
}

let activeWatcher = null;

export function watchRequestedOrders(onChange) {
  if (activeWatcher) {
    activeWatcher();
    activeWatcher = null;
  }

  try {
    const col = ordersCollection();
    activeWatcher = col
      .where("status", "==", "requested")
      .orderBy("lastRequestedAt", "desc")
      .limit(100)
      .onSnapshot(
        (snapshot) => {
          const orders = [];
          snapshot.forEach((doc) => orders.push(doc.data()));
          onChange(orders);
        },
        (err) => log("Watcher error:", err.message),
      );
  } catch (e) {
    log("Failed to start watcher:", e.message);
  }
}

export function stopWatchingOrders() {
  if (activeWatcher) {
    activeWatcher();
    activeWatcher = null;
  }
}
