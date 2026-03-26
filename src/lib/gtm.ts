export type GtmViewContentPayload = {
  content_id: string;
  content_name: string;
  content_category: string;
  value: number;
  currency: string;
  language: string;
};

export function pushGtmViewContent(payload: GtmViewContentPayload) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "view_content",
    ...payload,
  });
}
