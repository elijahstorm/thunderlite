import { c as create_ssr_component, b as subscribe, j as get_store_value, v as validate_component } from "../../../chunks/ssr.js";
import { l as loadedState, u as unitData, c as connectionDecision, m as mapStore, M as MapRender, a as createImageLoader } from "../../../chunks/mapStore.js";
let rows = 100;
let cols = 100;
const MapLoader = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $loadedState, $$unsubscribe_loadedState;
  $$unsubscribe_loadedState = subscribe(loadedState, (value) => $loadedState = value);
  const loadChecker = (finished) => loadedState.set(finished);
  const map = get_store_value(mapStore) ?? {
    rows,
    cols,
    layers: {
      ground: new Array(rows * cols).fill(0).map((_, index) => ({
        type: Math.random() * 3 > 1 ? 15 : 0,
        state: 0
      })),
      units: new Array(rows * cols).fill(0).map((_, index) => Math.random() * 4 > 1 ? null : {
        type: Math.floor(Math.random() * unitData.length),
        tile: index * cols + rows,
        team: index % 2,
        state: 4
      }),
      sky: new Array(rows * cols).fill(0).map((_, index) => Math.random() * 100 > 7 ? null : {
        type: Math.floor(Math.random() * 2),
        tile: index * cols + rows,
        state: 0
      })
    }
  };
  map.layers.ground.map((object, index) => object.state = connectionDecision(object)(map, index));
  mapStore.set(map);
  $$unsubscribe_loadedState();
  return `<div class="p-6 h-screen">${validate_component(MapRender, "MapRender").$$render(
    $$result,
    {
      map,
      makeImage: createImageLoader(loadChecker),
      loaded: $loadedState
    },
    {},
    {
      default: () => {
        return `<p data-svelte-h="svelte-qeejp2">loading...</p>`;
      }
    }
  )}</div>`;
});
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  return `${validate_component(MapLoader, "MapLoader").$$render($$result, {}, {}, {})}`;
});
export {
  Page as default
};
