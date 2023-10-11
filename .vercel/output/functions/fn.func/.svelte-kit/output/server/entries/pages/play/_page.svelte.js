import { c as create_ssr_component, b as subscribe, v as validate_component } from "../../../chunks/ssr.js";
import { m as mapStore, l as loadedState, u as unitData, M as MapRender, c as createImageLoader } from "../../../chunks/mapStore.js";
let rows = 10;
let cols = 11;
const MapLoader = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $mapStore, $$unsubscribe_mapStore;
  let $loadedState, $$unsubscribe_loadedState;
  $$unsubscribe_mapStore = subscribe(mapStore, (value) => $mapStore = value);
  $$unsubscribe_loadedState = subscribe(loadedState, (value) => $loadedState = value);
  const loadChecker = (finished) => loadedState.set(finished);
  const map = $mapStore ?? {
    rows,
    cols,
    layers: {
      ground: new Array(rows * cols).fill(0).map((_, index) => ({
        type: Math.random() * 3 > 1 ? 4 : 0,
        state: 0
      })),
      units: new Array(rows * cols).fill(0).map((_, index) => index % cols !== 2 ? null : {
        type: Math.floor(Math.random() * unitData.length),
        team: index % 2,
        state: 4
      }),
      sky: new Array(rows * cols).fill(0).map((_, index) => Math.floor(index / cols) !== 2 ? null : {
        type: Math.floor(Math.random() * 2),
        state: 0
      })
    },
    filters: {
      ground: (active) => active.map((data) => data.type),
      units: (active) => active.filter((data) => data !== null).map((data) => data.type),
      sky: (active) => active.filter((data) => data !== null).map((data) => data.type)
    }
  };
  mapStore.set(map);
  $$unsubscribe_mapStore();
  $$unsubscribe_loadedState();
  return `<div class="p-6 h-screen">${validate_component(MapRender, "MapRender").$$render(
    $$result,
    {
      map,
      select: void 0,
      makeImage: createImageLoader(loadChecker),
      loaded: $loadedState
    },
    {},
    {}
  )}</div>`;
});
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `${validate_component(MapLoader, "MapLoader").$$render($$result, {}, {}, {})}`;
});
export {
  Page as default
};
