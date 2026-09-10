import { parseHtml, generateHtml, formatCoords, parseCoords } from '../src/renderer/js/image-map/tag-parser.js';

console.log('--- Testing Tag Parser ---');

// 1. サンプルHTMLのパーステスト
const sampleHtml = `
<img src="assets/banner.jpg" usemap="#my-map" alt="バナー画像">
<map name="my-map">
    <area target="_blank" alt="Google" title="検索" href="https://google.com" coords="10,20,150,200" shape="rect">
    <area target="_self" alt="円形ボタン" title="円形" href="#circle" coords="300,100,50" shape="circle">
    <area target="" alt="多角形" title="ポリゴン" href="#poly" coords="20,20,40,40,60,20" shape="poly">
</map>
`;

const parsed = parseHtml(sampleHtml);
console.log('Map Name:', parsed.mapName);
console.log('Image Src:', parsed.imageSrc);
console.log('Image Alt:', parsed.imageAlt);
console.log('Areas count:', parsed.areas.length);

if (parsed.mapName !== 'my-map') throw new Error('mapName mismatch');
if (parsed.imageSrc !== 'assets/banner.jpg') throw new Error('imageSrc mismatch');
if (parsed.areas.length !== 3) throw new Error('areas count mismatch');

const rectArea = parsed.areas[0];
console.log('Rect Area:', rectArea);
if (rectArea.shape !== 'rect') throw new Error('rect shape mismatch');
if (rectArea.coords.join(',') !== '10,20,150,200') throw new Error('rect coords mismatch');
if (rectArea.href !== 'https://google.com') throw new Error('rect href mismatch');
if (rectArea.target !== '_blank') throw new Error('rect target mismatch');

const circleArea = parsed.areas[1];
console.log('Circle Area:', circleArea);
if (circleArea.shape !== 'circle') throw new Error('circle shape mismatch');
if (circleArea.coords.join(',') !== '300,100,50') throw new Error('circle coords mismatch');

const polyArea = parsed.areas[2];
console.log('Poly Area:', polyArea);
if (polyArea.shape !== 'poly') throw new Error('poly shape mismatch');
if (polyArea.coords.join(',') !== '20,20,40,40,60,20') throw new Error('poly coords mismatch');

// 2. HTML生成テスト
const generatedHtml = generateHtml({
  mapName: parsed.mapName,
  imageSrc: parsed.imageSrc,
  imageAlt: parsed.imageAlt,
  areas: parsed.areas,
  includeImg: true
});

console.log('Generated HTML:\n' + generatedHtml);

// 3. 再パース整合性テスト (Round-trip)
const reparsed = parseHtml(generatedHtml);
if (reparsed.areas.length !== 3) throw new Error('Roundtrip area count mismatch');
if (reparsed.areas[0].coords.join(',') !== '10,20,150,200') throw new Error('Roundtrip rect mismatch');
if (reparsed.areas[1].coords.join(',') !== '300,100,50') throw new Error('Roundtrip circle mismatch');
if (reparsed.areas[2].coords.join(',') !== '20,20,40,40,60,20') throw new Error('Roundtrip poly mismatch');

// 4. <img> タグ単体からのパース・HTML生成テスト
console.log('--- Testing img-only Tag Parser ---');
const imgOnlyHtml = '<img src="images/hero-banner.jpg" class="responsive-img" alt="メインバナー">';
const parsedImgOnly = parseHtml(imgOnlyHtml);
console.log('ImgOnly Map Name:', parsedImgOnly.mapName);
console.log('ImgOnly Image Src:', parsedImgOnly.imageSrc);
console.log('ImgOnly Image Alt:', parsedImgOnly.imageAlt);
console.log('ImgOnly Extra Attrs:', parsedImgOnly.extraAttrs);
console.log('ImgOnly Areas Count:', parsedImgOnly.areas.length);

if (parsedImgOnly.imageSrc !== 'images/hero-banner.jpg') throw new Error('imgOnly imageSrc mismatch');
if (parsedImgOnly.imageAlt !== 'メインバナー') throw new Error('imgOnly imageAlt mismatch');
if (parsedImgOnly.mapName !== 'hero-banner-map') throw new Error('imgOnly mapName derivation mismatch');
if (parsedImgOnly.areas.length !== 0) throw new Error('imgOnly areas should be empty');
if (!parsedImgOnly.extraAttrs || parsedImgOnly.extraAttrs.class !== 'responsive-img') throw new Error('imgOnly extraAttrs mismatch');

const generatedImgOnly = generateHtml({
  mapName: parsedImgOnly.mapName,
  imageSrc: parsedImgOnly.imageSrc,
  imageAlt: parsedImgOnly.imageAlt,
  areas: [],
  includeImg: true,
  extraAttrs: parsedImgOnly.extraAttrs
});
console.log('Generated img-only HTML:\n' + generatedImgOnly);
if (!generatedImgOnly.includes('usemap="#hero-banner-map"')) throw new Error('generated HTML must have usemap');
if (!generatedImgOnly.includes('class="responsive-img"')) throw new Error('generated HTML must preserve class attribute');
if (!generatedImgOnly.includes('<map name="hero-banner-map">')) throw new Error('generated HTML must contain map tag');

console.log('✓ All Tag Parser tests passed successfully!');
