import { c as create_ssr_component, v as validate_component } from "../../../chunks/ssr.js";
import { M as MapEditor } from "../../../chunks/MapEditor.js";
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `${validate_component(MapEditor, "MapEditor").$$render($$result, {}, {}, {})}`;
});
export {
  Page as default
};
