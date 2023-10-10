export const mapExporter = (map: MapObject) => JSON.stringify(map)

export const mapImporter = (content: string) => JSON.parse(content) as MapObject

export const mapHash = (map: MapObject) => `${map?.title ?? '_'}.tempHash`
