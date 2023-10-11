import { c as create_ssr_component, a as add_attribute, e as escape, n as null_to_empty, v as validate_component, m as missing_component, b as subscribe, d as each } from "../../chunks/ssr.js";
import { t as toasts } from "../../chunks/Toasts.svelte_svelte_type_style_lang.js";
const Cancel = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let cssPropPrefix;
  let { type = "info" } = $$props;
  if ($$props.type === void 0 && $$bindings.type && type !== void 0)
    $$bindings.type(type);
  cssPropPrefix = `--as-toast-${type}-color`;
  return `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0.571429 0.571436C0.255838 0.887027 0.255838 1.3987 0.571429 1.71429L6.28571 7.42858C6.6013 7.74417 7.11298 7.74417 7.42857 7.42858C7.74416 7.11299 7.74416 6.60131 7.42857 6.28572L1.71429 0.571437C1.3987 0.255845 0.887021 0.255845 0.571429 0.571436Z"${add_attribute("fill", `var(${cssPropPrefix}, var(--as-toast-color, black))`, 0)}></path><path d="M7.42857 0.57141C7.11298 0.255819 6.60131 0.255819 6.28571 0.57141L0.571431 6.28569C0.25584 6.60128 0.255839 7.11296 0.57143 7.42855C0.887021 7.74414 1.3987 7.74414 1.71429 7.42855L7.42857 1.71427C7.74416 1.39868 7.74416 0.887002 7.42857 0.57141Z"${add_attribute("fill", `var(${cssPropPrefix}, var(--as-toast-color, black))`, 0)}></path></svg>`;
});
const css$1 = {
  code: "div.svelte-1ft637d.svelte-1ft637d{display:flex;width:max-content;justify-content:space-between;align-items:center;text-decoration:none;font-family:var(--as-toast-font-family, inherit);font-weight:var(--as-toast-font-weight, 400);font-size:var(--as-toast-font-size, 1em);padding:var(--as-toast-padding, 1em);margin-top:var(--as-toast-margin-top, 1em);min-width:var(--as-toast-min-width, 300px);max-width:var(--as-toast-max-width, calc(100vw - 2em));border:var(--as-toast-border, 1px solid black);border-radius:var(--as-toast-border-radius, 0.5em);color:var(--as-toast-color, black);backdrop-filter:var(--as-toast-backdrop-filter, none);-webkit-backdrop-filter:var(--as-toast-backdrop-filter, none);box-shadow:var(\n			--as-toast-shadow,\n			0 0.3px 1.4px rgba(0, 0, 0, 0.068),\n			0 0.7px 3.5px rgba(0, 0, 0, 0.098),\n			0 1.4px 7.1px rgba(0, 0, 0, 0.122),\n			0 2.9px 14.6px rgba(0, 0, 0, 0.152),\n			0 8px 40px rgba(0, 0, 0, 0.22)\n		)}div.svelte-1ft637d button.svelte-1ft637d{display:flex;margin-left:2em;border-radius:var(--as-toast-btn-border-radius, 999999999px);padding:var(--as-toast-btn-padding, 0.45em);border:var(--as-toast-btn-border, 1px solid black);background:var(--as-toast-btn-background, white);cursor:pointer}.info.svelte-1ft637d.svelte-1ft637d{color:var(--as-toast-info-color, var(--as-toast-color, black));border-color:var(--as-toast-info-border-color, #2786cb);background:var(--as-toast-info-background, #abd2ef)}.warn.svelte-1ft637d.svelte-1ft637d{color:var(--as-toast-warn-color, var(--as-toast-color, black));border-color:var(--as-toast-warn-border-color, #c92626);background:var(--as-toast-warn-background, #efa9a9)}",
  map: null
};
const Toast = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { toast } = $$props;
  let { cancelIcon } = $$props;
  if ($$props.toast === void 0 && $$bindings.toast && toast !== void 0)
    $$bindings.toast(toast);
  if ($$props.cancelIcon === void 0 && $$bindings.cancelIcon && cancelIcon !== void 0)
    $$bindings.cancelIcon(cancelIcon);
  $$result.css.add(css$1);
  return `<div class="${escape(null_to_empty(toast.type), true) + " svelte-1ft637d"}"><span role="status"><!-- HTML_TAG_START -->${toast.msg}<!-- HTML_TAG_END --></span> <button aria-label="Cancel Button" class="svelte-1ft637d">${validate_component(cancelIcon || missing_component, "svelte:component").$$render($$result, { type: toast.type }, {}, {})}</button> </div>`;
});
const css = {
  code: "ul.svelte-19uzrsi{list-style:none;display:flex;flex-direction:column;align-items:center;position:fixed;bottom:var(--as-toast-bottom, 1em);right:50%;transform:translate(50%, 0%);margin:0;padding:0}",
  map: null
};
const Toasts = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $toasts, $$unsubscribe_toasts;
  $$unsubscribe_toasts = subscribe(toasts, (value) => $toasts = value);
  let { toastComponent = Toast } = $$props;
  let { cancelIcon = Cancel } = $$props;
  if ($$props.toastComponent === void 0 && $$bindings.toastComponent && toastComponent !== void 0)
    $$bindings.toastComponent(toastComponent);
  if ($$props.cancelIcon === void 0 && $$bindings.cancelIcon && cancelIcon !== void 0)
    $$bindings.cancelIcon(cancelIcon);
  $$result.css.add(css);
  $$unsubscribe_toasts();
  return `${$toasts.length ? `<ul class="svelte-19uzrsi">${each($toasts, (toast) => {
    return `<li>${validate_component(toastComponent || missing_component, "svelte:component").$$render($$result, { toast, cancelIcon }, {}, {})} </li>`;
  })}</ul>` : ``}`;
});
const app = "";
const Layout = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `${$$result.head += `<!-- HEAD_svelte-22s6di_START --><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin=""><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;500;700;900&family=Roboto:ital,wght@0,100;0,300;0,500;0,700;0,900;1,500&display=swap" rel="stylesheet"><!-- HEAD_svelte-22s6di_END -->`, ""} ${slots.default ? slots.default({}) : ``} ${validate_component(Toasts, "Toasts").$$render($$result, {}, {}, {})}`;
});
export {
  Layout as default
};
