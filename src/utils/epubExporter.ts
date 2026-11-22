import JSZip from 'jszip';
import type { Chapter, Novel, Segment } from '../types';
import { triggerBlobDownload } from './chapterParser';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeFilename(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 72) || 'mac_van_book';
}

function buildChapterXhtml(
  chapter: Chapter,
  segments: Segment[],
  bilingual: boolean,
  targetLang: string
): string {
  const title = (chapter.titleTranslated || chapter.titleSource || `Chương ${chapter.order}`).trim();
  const sorted = [...segments].sort((a, b) => a.index - b.index);

  const paragraphsHtml = sorted
    .map((seg) => {
      const target = seg.translatedText.trim() || `[Chưa dịch đoạn #${seg.index + 1}]`;
      if (bilingual) {
        return `<p class="source">${escapeXml(seg.sourceText.trim())}</p>\n<p class="target">${escapeXml(target)}</p>`;
      }
      return `<p class="target">${escapeXml(target)}</p>`;
    })
    .join('\n');

  const sourceSubtitle =
    bilingual && chapter.titleTranslated.trim() && chapter.titleSource.trim()
      ? `<p class="subtitle">${escapeXml(chapter.titleSource.trim())}</p>`
      : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(targetLang || 'vi')}">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <section class="chapter">
    <h1>${escapeXml(title)}</h1>
    ${sourceSubtitle}
    ${paragraphsHtml}
  </section>
</body>
</html>`;
}

async function generateEpubBlob(params: {
  bookTitle: string;
  author: string;
  language: string;
  chapters: Array<{ chapter: Chapter; segments: Segment[] }>;
  bilingual: boolean;
}): Promise<Blob> {
  const zip = new JSZip();

  // EPUB 3 requires uncompressed 'mimetype' as the first file
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/xhtml+xml"/>
  </rootfiles>
</container>`.replace('application/xhtml+xml', 'application/oebps-package+xml')
  );

  zip.file(
    'OEBPS/style.css',
    `body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.75;
  margin: 1.5em;
  color: #1f1c18;
}
h1 {
  font-size: 1.5em;
  margin-bottom: 0.6em;
  line-height: 1.3;
}
.subtitle {
  color: #6b6257;
  font-size: 0.9em;
  font-style: italic;
  margin-bottom: 1.2em;
}
p.target {
  margin: 0 0 1em 0;
  text-indent: 1.2em;
}
p.source {
  margin: 0.8em 0 0.25em 0;
  color: #6b6257;
  font-size: 0.9em;
}
nav ol {
  padding-left: 1.4em;
}
nav li {
  margin: 0.4em 0;
}
`
  );

  const sortedChapters = [...params.chapters].sort((a, b) => a.chapter.order - b.chapter.order);
  const manifestItems: string[] = [];
  const spineItems: string[] = [];
  const navItems: string[] = [];

  sortedChapters.forEach((entry, idx) => {
    const fileId = `chap_${idx + 1}`;
    const href = `${fileId}.xhtml`;
    const chTitle = (
      entry.chapter.titleTranslated ||
      entry.chapter.titleSource ||
      `Chương ${idx + 1}`
    ).trim();

    zip.file(
      `OEBPS/${href}`,
      buildChapterXhtml(entry.chapter, entry.segments, params.bilingual, params.language)
    );

    manifestItems.push(
      `    <item id="${fileId}" href="${href}" media-type="application/xhtml+xml"/>`
    );
    spineItems.push(`    <itemref idref="${fileId}"/>`);
    navItems.push(`      <li><a href="${href}">${escapeXml(chTitle)}</a></li>`);
  });

  zip.file(
    'OEBPS/toc.xhtml',
    `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(params.language || 'vi')}">
<head>
  <meta charset="utf-8" />
  <title>Mục lục - ${escapeXml(params.bookTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Mục lục</h1>
    <ol>
${navItems.join('\n')}
    </ol>
  </nav>
</body>
</html>`
  );

  const bookId = `urn:uuid:macvan-${Date.now().toString(36)}`;
  const modifiedIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="${escapeXml(params.language || 'vi')}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${bookId}</dc:identifier>
    <dc:title>${escapeXml(params.bookTitle)}</dc:title>
    <dc:creator>${escapeXml(params.author || 'Mặc Vận Studio')}</dc:creator>
    <dc:language>${escapeXml(params.language || 'vi')}</dc:language>
    <meta property="dcterms:modified">${modifiedIso}</meta>
  </metadata>
  <manifest>
    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
${manifestItems.join('\n')}
  </manifest>
  <spine>
${spineItems.join('\n')}
  </spine>
</package>`
  );

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
  });
}

export async function exportChapterToEpub(
  novel: Novel,
  chapter: Chapter,
  segments: Segment[],
  bilingual = false
): Promise<void> {
  const chTitle = (chapter.titleTranslated || chapter.titleSource || 'Chuong').trim();
  const blob = await generateEpubBlob({
    bookTitle: `${novel.title} — ${chTitle}`,
    author: novel.author,
    language: novel.targetLang || 'vi',
    chapters: [{ chapter, segments }],
    bilingual,
  });

  const suffix = bilingual ? '_song_ngu' : '';
  triggerBlobDownload(`${safeFilename(novel.title)}_${safeFilename(chTitle)}${suffix}.epub`, blob);
}

export async function exportNovelToEpub(
  novel: Novel,
  chaptersWithSegments: Array<{ chapter: Chapter; segments: Segment[] }>,
  bilingual = false
): Promise<void> {
  const blob = await generateEpubBlob({
    bookTitle: novel.title,
    author: novel.author,
    language: novel.targetLang || 'vi',
    chapters: chaptersWithSegments,
    bilingual,
  });

  const suffix = bilingual ? '_song_ngu' : '';
  triggerBlobDownload(`${safeFilename(novel.title)}${suffix}.epub`, blob);
}
