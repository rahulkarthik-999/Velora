// Resolves the Windows installer for the Velora desktop app.
// DESKTOP_DOWNLOAD_URL (+ optional DESKTOP_VERSION) pins a specific build;
// otherwise the newest GitHub release with an NSIS "-setup.exe" asset is used.

const GITHUB_REPO = process.env.DESKTOP_RELEASE_REPO || 'rahulkarthik-999/Velora';

export type DesktopRelease = {
  url: string;
  version: string | null;
  sizeBytes: number | null;
  publishedAt: string | null;
};

type GithubAsset = { name: string; browser_download_url: string; size: number };
type GithubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GithubAsset[];
};

export async function getDesktopRelease(): Promise<DesktopRelease | null> {
  const pinned = process.env.DESKTOP_DOWNLOAD_URL;
  if (pinned) {
    return { url: pinned, version: process.env.DESKTOP_VERSION || null, sizeBytes: null, publishedAt: null };
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const releases = (await res.json()) as GithubRelease[];
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      const asset = release.assets.find((a) => /-setup\.exe$/i.test(a.name));
      if (asset) {
        return {
          url: asset.browser_download_url,
          version: release.tag_name.replace(/^(desktop-)?v/, ''),
          sizeBytes: asset.size,
          publishedAt: release.published_at,
        };
      }
    }
  } catch {
    // Network failure: treat as "not available yet" rather than breaking the page.
  }
  return null;
}
