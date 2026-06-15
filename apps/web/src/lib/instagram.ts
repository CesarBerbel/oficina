export type InstagramPost = {
  id: string;
  caption: string | null;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string | null;
};

type InstagramGraphMedia = {
  id?: unknown;
  caption?: unknown;
  media_type?: unknown;
  media_url?: unknown;
  thumbnail_url?: unknown;
  permalink?: unknown;
  timestamp?: unknown;
};

type InstagramGraphResponse = {
  data?: InstagramGraphMedia[];
};

const GRAPH_API_VERSION = process.env.INSTAGRAM_GRAPH_API_VERSION || 'v23.0';
const INSTAGRAM_USER_ID = process.env.INSTAGRAM_USER_ID;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizePost(media: InstagramGraphMedia): InstagramPost | null {
  const id = stringOrNull(media.id);
  const permalink = stringOrNull(media.permalink);

  if (!id || !permalink) return null;

  const mediaType = stringOrNull(media.media_type) ?? 'IMAGE';

  return {
    id,
    caption: stringOrNull(media.caption),
    mediaType,
    mediaUrl: stringOrNull(media.media_url),
    thumbnailUrl: stringOrNull(media.thumbnail_url),
    permalink,
    timestamp: stringOrNull(media.timestamp),
  };
}

export async function getLatestInstagramPosts(limit = 6): Promise<InstagramPost[]> {
  if (!INSTAGRAM_USER_ID || !INSTAGRAM_ACCESS_TOKEN) return [];

  const fields = [
    'id',
    'caption',
    'media_type',
    'media_url',
    'thumbnail_url',
    'permalink',
    'timestamp',
  ].join(',');
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${INSTAGRAM_USER_ID}/media`,
  );

  url.searchParams.set('fields', fields);
  url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 12)));
  url.searchParams.set('access_token', INSTAGRAM_ACCESS_TOKEN);

  try {
    const response = await fetch(url, {
      next: { revalidate: 60 * 15 },
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as InstagramGraphResponse;

    return (payload.data ?? [])
      .map(normalizePost)
      .filter((post): post is InstagramPost => Boolean(post));
  } catch {
    return [];
  }
}

export function getInstagramProfileUrl(): string | null {
  return stringOrNull(process.env.NEXT_PUBLIC_INSTAGRAM_PROFILE_URL);
}
