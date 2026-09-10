/**
 * HTML <map> / <area> タグのパースおよびコード生成ユーティリティ
 */

/**
 * 座標配列をカンマ区切り文字列に変換
 * @param {number[]} coords
 * @returns {string}
 */
export function formatCoords(coords) {
  if (!Array.isArray(coords)) return '';
  return coords.map((c) => Math.round(c)).join(',');
}

/**
 * coords 文字列を数値配列にパース
 * @param {string} coordsStr
 * @returns {number[]}
 */
export function parseCoords(coordsStr) {
  if (!coordsStr) return [];
  return coordsStr
    .split(/[\s,]+/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n));
}

/**
 * シェイプ一覧と画像情報からHTMLコードを生成
 * @param {Object} params
 * @param {string} params.mapName - マップ名
 * @param {string} params.imageSrc - 画像パス
 * @param {string} [params.imageAlt] - 画像代替テキスト
 * @param {Array} params.areas - エリアオブジェクト一覧
 * @param {boolean} [params.includeImg=true] - <img>タグを含めるか
 * @returns {string}
 */
export function generateHtml({ mapName = 'image-map', imageSrc = '', imageAlt = '', areas = [], includeImg = true, extraAttrs = null }) {
  const cleanMapName = mapName.trim() || 'image-map';
  const lines = [];

  if (includeImg && imageSrc) {
    const altAttr = (imageAlt !== undefined && imageAlt !== null) ? ` alt="${escapeAttr(imageAlt)}"` : '';
    let extraStr = '';
    if (extraAttrs && typeof extraAttrs === 'object') {
      for (const [k, v] of Object.entries(extraAttrs)) {
        extraStr += ` ${escapeAttr(k)}="${escapeAttr(v)}"`;
      }
    }
    lines.push(`<img src="${escapeAttr(imageSrc)}" usemap="#${escapeAttr(cleanMapName)}"${altAttr}${extraStr}>`);
    lines.push('');
  }

  lines.push(`<map name="${escapeAttr(cleanMapName)}">`);

  for (const area of areas) {
    const shape = (area.shape || 'rect').toLowerCase();
    const coordsStr = formatCoords(area.coords);

    let tag = `    <area target="${escapeAttr(area.target || '')}" alt="${escapeAttr(area.alt || '')}" title="${escapeAttr(area.title || area.alt || '')}" href="${escapeAttr(area.href || '')}" coords="${coordsStr}" shape="${shape}">`;
    lines.push(tag);
  }

  lines.push('</map>');

  return lines.join('\n');
}

/**
 * HTML文字列から map, area, img 情報を抽出
 * @param {string} htmlString
 * @returns {{ mapName: string, imageSrc: string, imageAlt: string, areas: Array }}
 */
export function parseHtml(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return { mapName: 'image-map', imageSrc: '', imageAlt: '', extraAttrs: null, areas: [] };
  }

  let mapName = '';
  let imageSrc = '';
  let imageAlt = '';
  let extraAttrs = null;
  const rawAreas = [];

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    const imgEl = doc.querySelector('img');
    if (imgEl) {
      imageSrc = imgEl.getAttribute('src') || '';
      imageAlt = imgEl.getAttribute('alt') || '';
      extraAttrs = {};
      for (const attr of imgEl.attributes) {
        const name = attr.name.toLowerCase();
        if (!['src', 'alt', 'usemap'].includes(name)) {
          extraAttrs[attr.name] = attr.value;
        }
      }
    }

    const mapEl = doc.querySelector('map');
    if (mapEl && mapEl.getAttribute('name')) {
      mapName = mapEl.getAttribute('name');
    } else if (imgEl && imgEl.getAttribute('usemap')) {
      mapName = imgEl.getAttribute('usemap').replace(/^#/, '');
    }

    const areaElements = mapEl ? mapEl.querySelectorAll('area') : doc.querySelectorAll('area');
    for (const el of areaElements) {
      rawAreas.push({
        shape: el.getAttribute('shape') || 'rect',
        coords: el.getAttribute('coords') || '',
        href: el.getAttribute('href') || '',
        alt: el.getAttribute('alt') || '',
        title: el.getAttribute('title') || '',
        target: el.getAttribute('target') || ''
      });
    }
  } else {
    // Node.js 等の DOMParser がない環境での正規表現パーサー
    const imgMatch = htmlString.match(/<img\b([^>]*)>/i);
    if (imgMatch) {
      const srcM = imgMatch[1].match(/src=["']([^"']*)["']/i);
      const altM = imgMatch[1].match(/alt=["']([^"']*)["']/i);
      const usemapM = imgMatch[1].match(/usemap=["']#?([^"']*)["']/i);
      if (srcM) imageSrc = srcM[1];
      if (altM) imageAlt = altM[1];
      if (usemapM) mapName = usemapM[1];

      extraAttrs = {};
      const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
      let aMatch;
      while ((aMatch = attrRegex.exec(imgMatch[1])) !== null) {
        const key = aMatch[1].toLowerCase();
        if (!['src', 'alt', 'usemap'].includes(key)) {
          extraAttrs[aMatch[1]] = aMatch[2];
        }
      }
    }

    const mapMatch = htmlString.match(/<map\b[^>]*name=["']([^"']*)["'][^>]*>/i);
    if (mapMatch) {
      mapName = mapMatch[1];
    }

    const areaRegex = /<area\b([^>]*)>/gi;
    let match;
    while ((match = areaRegex.exec(htmlString)) !== null) {
      const attrs = match[1];
      const getAttr = (name) => {
        const m = attrs.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
        return m ? m[1] : '';
      };
      rawAreas.push({
        shape: getAttr('shape') || 'rect',
        coords: getAttr('coords') || '',
        href: getAttr('href'),
        alt: getAttr('alt'),
        title: getAttr('title'),
        target: getAttr('target')
      });
    }
  }

  const areas = [];
  let index = 1;
  for (const item of rawAreas) {
    const rawShape = (item.shape || 'rect').toLowerCase();
    let shape = 'rect';
    if (rawShape === 'circle' || rawShape === 'circ') {
      shape = 'circle';
    } else if (rawShape === 'poly' || rawShape === 'polygon') {
      shape = 'poly';
    }

    const coords = parseCoords(item.coords);

    if (shape === 'rect' && coords.length >= 4) {
      areas.push({
        id: `area_${Date.now()}_${index++}`,
        shape: 'rect',
        coords: coords.slice(0, 4),
        href: item.href || '',
        alt: item.alt || '',
        title: item.title || '',
        target: item.target || ''
      });
    } else if (shape === 'circle' && coords.length >= 3) {
      areas.push({
        id: `area_${Date.now()}_${index++}`,
        shape: 'circle',
        coords: coords.slice(0, 3),
        href: item.href || '',
        alt: item.alt || '',
        title: item.title || '',
        target: item.target || ''
      });
    } else if (shape === 'poly' && coords.length >= 6) {
      const evenCoords = coords.length % 2 === 0 ? coords : coords.slice(0, coords.length - 1);
      areas.push({
        id: `area_${Date.now()}_${index++}`,
        shape: 'poly',
        coords: evenCoords,
        href: item.href || '',
        alt: item.alt || '',
        title: item.title || '',
        target: item.target || ''
      });
    }
  }

  if (!mapName) {
    if (imageSrc) {
      const cleanName = imageSrc.split('/').pop().split('.')[0].replace(/[^a-zA-Z0-9_-]/g, '');
      mapName = cleanName ? `${cleanName}-map` : 'image-map';
    } else {
      mapName = 'image-map';
    }
  }

  return {
    mapName,
    imageSrc,
    imageAlt,
    extraAttrs,
    areas
  };
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
