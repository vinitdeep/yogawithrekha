import { describe, expect, it } from 'vitest';
import { driveEmbed, parseDrive, parseYouTube, youTubeEmbed } from '../src/lib/videoLinks';

describe('YouTube links', () => {
  it.each([
    'https://youtu.be/aqz-KE-bpKQ', 'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=10s', 'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://www.youtube.com/shorts/aqz-KE-bpKQ', 'https://www.youtube.com/embed/aqz-KE-bpKQ', 'https://youtube.com/live/aqz-KE-bpKQ', 'aqz-KE-bpKQ',
  ])('%s', (u) => expect(parseYouTube(u)).toBe('aqz-KE-bpKQ'));
  it('rejects other sites and junk', () => {
    for (const u of ['https://evil.com/watch?v=aqz-KE-bpKQ', 'https://youtube.com/watch?v=short', 'javascript:alert(1)', '']) expect(parseYouTube(u)).toBeNull();
  });
  it('builds a no-cookie embed with fullscreen kept in the site player', () => {
    expect(youTubeEmbed('aqz-KE-bpKQ')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/aqz-KE-bpKQ\?.*fs=0/);
  });
});

describe('Google Drive links', () => {
  const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  it.each([`https://drive.google.com/file/d/${id}/view?usp=sharing`, `https://drive.google.com/open?id=${id}`, `https://drive.google.com/uc?id=${id}&export=download`, id])('%s', (u) => expect(parseDrive(u)).toBe(id));
  it('rejects other sites', () => expect(parseDrive(`https://evil.com/file/d/${id}/view`)).toBeNull());
  it('builds the preview embed', () => expect(driveEmbed(id)).toBe(`https://drive.google.com/file/d/${id}/preview`));
});
