import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { firebaseConfig } from "./config";

let firebaseApp = null;
let auth = null;
let currentUser = null;
let authReadyResolve = null;
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve;
});

export function initFirebase() {
  if (firebaseApp) return;
  firebaseApp = firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();

  auth.onAuthStateChanged((user) => {
    currentUser = user;
    if (authReadyResolve) {
      authReadyResolve();
      authReadyResolve = null;
    }
  });
}

export async function signIn() {
  initFirebase();

  const token = await new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (tok) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tok);
      }
    });
  });

  const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
  const result = await auth.signInWithCredential(credential);
  currentUser = result.user;
  return serializeUser(currentUser);
}

export async function signOut() {
  initFirebase();

  const token = await new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (tok) => {
      resolve(tok);
    });
  });

  if (token) {
    await new Promise((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, resolve);
    });
  }

  await auth.signOut();
  currentUser = null;
}

export async function getCurrentUser() {
  initFirebase();
  await authReady;
  return currentUser ? serializeUser(currentUser) : null;
}

export function getRawUser() {
  return currentUser;
}

function serializeUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}
