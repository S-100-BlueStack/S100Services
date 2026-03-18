const listeners = [];
const notices = [];

let unreadCount = 0;

export function subscribeToNotices(callback) {
  listeners.push(callback);

  callback(null, notices, unreadCount);
}
export function addNotice(notice) {
  notices.unshift(notice);

  unreadCount++;

  for (const listener of listeners) {
    listener(notice, notices, unreadCount);
  }
}

export function getNotices() {
  return [...notices];
}

export function getUnreadCount() {
  return unreadCount;
}

export function resetUnread() {
  unreadCount = 0;

  for (const listener of listeners) {
    listener(null, notices, unreadCount);
  }
}
