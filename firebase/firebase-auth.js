/**
 * Firebase Authentication layer for SellerForge.
 *
 * Uses chrome.identity to get a Google OAuth token,
 * then signs into Firebase with that credential.
 */

(function () {
  var SF = (self.SellerForge = self.SellerForge || {});

  var firebaseApp = null;
  var auth = null;
  var currentUser = null;
  var authReadyResolve = null;
  var authReady = new Promise(function (resolve) {
    authReadyResolve = resolve;
  });

  /**
   * Initializes Firebase app and auth (idempotent).
   */
  SF.initFirebase = function () {
    if (firebaseApp) return;
    firebaseApp = firebase.initializeApp(SF.firebaseConfig);
    auth = firebase.auth();

    auth.onAuthStateChanged(function (user) {
      currentUser = user;
      if (authReadyResolve) {
        authReadyResolve();
        authReadyResolve = null;
      }
    });
  };

  /**
   * Signs in using Chrome's identity API + Firebase.
   * Returns the serialized Firebase user object.
   */
  SF.signIn = async function () {
    SF.initFirebase();

    var token = await new Promise(function (resolve, reject) {
      chrome.identity.getAuthToken({ interactive: true }, function (tok) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(tok);
        }
      });
    });

    var credential = firebase.auth.GoogleAuthProvider.credential(null, token);
    var result = await auth.signInWithCredential(credential);
    currentUser = result.user;
    return serializeUser(currentUser);
  };

  /**
   * Signs out of Firebase and removes the cached Chrome identity token.
   */
  SF.signOut = async function () {
    SF.initFirebase();

    var token = await new Promise(function (resolve) {
      chrome.identity.getAuthToken({ interactive: false }, function (tok) {
        resolve(tok);
      });
    });

    if (token) {
      await new Promise(function (resolve) {
        chrome.identity.removeCachedAuthToken({ token: token }, resolve);
      });
    }

    await auth.signOut();
    currentUser = null;
  };

  /**
   * Returns the current signed-in user (serialized) or null.
   * Waits for Firebase auth to finish restoring the persisted session.
   */
  SF.getCurrentUser = async function () {
    SF.initFirebase();
    await authReady;
    return currentUser ? serializeUser(currentUser) : null;
  };

  /**
   * Returns the raw Firebase user (for internal use by Firestore layer).
   */
  SF.getRawUser = function () {
    return currentUser;
  };

  /**
   * Serializes a Firebase user into a plain object safe for messaging.
   */
  function serializeUser(user) {
    if (!user) return null;
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    };
  }
})();
