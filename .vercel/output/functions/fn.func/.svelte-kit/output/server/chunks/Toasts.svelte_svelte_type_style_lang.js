import { w as writable } from "./index.js";
const toasts = writable([]);
function addToast(msg, type = "info", removeAfter = 5e3) {
  const id = (/* @__PURE__ */ new Date()).valueOf() + msg;
  toasts.update((all) => [
    {
      id,
      msg,
      type,
      removeAfter
    },
    ...all
  ]);
  setTimeout(() => {
    removeToast(id);
  }, removeAfter);
  return id;
}
function removeToast(id) {
  toasts.update((all) => all.filter((toast) => toast.id !== id));
}
const Toast_svelte_svelte_type_style_lang = "";
const Toasts_svelte_svelte_type_style_lang = "";
export {
  addToast as a,
  toasts as t
};
