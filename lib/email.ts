// Emails a full itinerary via Resend, reusing the verified `intrafy.in` sender
// domain. The template is a self-contained, table-based HTML email in Wanderlore's
// monochrome + red theme — inline styles only, no emoji, no external assets.

import { Resend } from "resend";
import type { Itinerary, EnrichedPlace } from "./types";

const FROM = "Wanderlore <noreply@intrafy.in>";

export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

let resend: Resend | null = null;
function client(): Resend | null {
  if (!isEmailEnabled()) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY as string);
  return resend;
}

export async function sendItineraryEmail(
  to: string,
  itinerary: Itinerary
): Promise<{ ok: boolean; error?: string }> {
  const r = client();
  if (!r) return { ok: false, error: "Email is not configured on this deployment." };
  try {
    const { error } = await r.emails.send({
      from: FROM,
      to,
      subject: `Your cultural trip to ${itinerary.destinationFull} — Wanderlore`,
      html: buildItineraryEmail(itinerary),
    });
    if (error) return { ok: false, error: "The email service rejected the request." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not send the email." };
  }
}

/* ------------------------------- template -------------------------------- */

const RED = "#e5352b";
const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const LINE = "#e6e6e6";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionLabel(kicker: string, title: string): string {
  return `
    <tr><td style="padding:28px 0 0;">
      <div style="font:600 11px/1 'Courier New',monospace;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">${esc(kicker)}</div>
      <div style="font:700 19px/1.3 Arial,sans-serif;color:${INK};margin-top:6px;">${esc(title)}</div>
    </td></tr>`;
}

function placeRow(p: EnrichedPlace): string {
  const tag = p.type === "gem" ? "Hidden gem" : "Attraction";
  const tagColor = p.type === "gem" ? RED : MUTED;
  const verified = p.verified
    ? `<span style="color:${MUTED};">Verified on OpenStreetMap</span>`
    : `<span style="color:#a0a0a0;">Location unverified</span>`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:8px;margin-top:10px;">
      <tr><td style="padding:14px 16px;">
        <table role="presentation" width="100%"><tr>
          <td style="font:600 15px/1.3 Arial,sans-serif;color:${INK};">${esc(p.name)}</td>
          <td align="right" style="font:600 10px/1 'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;color:${tagColor};white-space:nowrap;">${tag}</td>
        </tr></table>
        <div style="font:400 13px/1.5 Arial,sans-serif;color:#333;margin-top:6px;">${esc(p.blurb)}</div>
        <div style="font:400 13px/1.5 Arial,sans-serif;color:${MUTED};margin-top:5px;"><b style="color:#444;">Why it matters:</b> ${esc(p.significance)}</div>
        <div style="font:400 12px/1.4 Arial,sans-serif;color:${MUTED};margin-top:8px;">Best time: ${esc(p.bestTime)} &nbsp;&middot;&nbsp; ${verified}</div>
      </td></tr>
    </table>`;
}

function buildItineraryEmail(it: Itinerary): string {
  const story = it.story
    .split(/\n\n+/)
    .map(
      (p) =>
        `<p style="font:400 15px/1.65 Arial,sans-serif;color:#333;margin:0 0 12px;">${esc(p)}</p>`
    )
    .join("");

  const days = it.days
    .map(
      (d) => `
      <tr><td style="padding:18px 0 0;">
        <table role="presentation"><tr>
          <td style="width:26px;height:26px;background:${INK};border-radius:6px;text-align:center;vertical-align:middle;font:700 12px/26px 'Courier New',monospace;color:#fff;">${d.day}</td>
          <td style="padding-left:10px;font:700 16px/1.3 Arial,sans-serif;color:${INK};">${esc(d.theme)}</td>
        </tr></table>
        ${d.items.map(placeRow).join("")}
      </td></tr>`
    )
    .join("");

  const secrets = it.localSecrets.length
    ? sectionLabel("Local secrets", "Hidden gems most tourists miss") +
      `<tr><td>${it.localSecrets.map(placeRow).join("")}</td></tr>`
    : "";

  const events = it.events.length
    ? sectionLabel("When to come", "Cultural events & festivals") +
      it.events
        .map(
          (e) => `
        <tr><td style="padding-top:10px;">
          <table role="presentation" width="100%" style="border:1px solid ${LINE};border-radius:8px;"><tr><td style="padding:14px 16px;">
            <table role="presentation" width="100%"><tr>
              <td style="font:600 15px Arial,sans-serif;color:${INK};">${esc(e.name)}</td>
              <td align="right" style="font:600 11px 'Courier New',monospace;color:${MUTED};white-space:nowrap;">${esc(e.whenTypical)}</td>
            </tr></table>
            <div style="font:400 13px/1.5 Arial,sans-serif;color:#333;margin-top:6px;">${esc(e.description)}</div>
            <div style="font:400 13px/1.5 Arial,sans-serif;color:${MUTED};margin-top:5px;"><b style="color:#444;">Roots:</b> ${esc(e.culturalRoot)}</div>
          </td></tr></table>
        </td></tr>`
        )
        .join("")
    : "";

  const experiences = it.experiences.length
    ? sectionLabel("Go deeper", "Authentic experiences to live") +
      it.experiences
        .map(
          (x) => `
        <tr><td style="padding-top:10px;">
          <table role="presentation" width="100%" style="border:1px solid ${LINE};border-radius:8px;"><tr><td style="padding:14px 16px;">
            <div style="font:600 15px Arial,sans-serif;color:${INK};">${esc(x.title)}</div>
            <div style="font:400 13px/1.5 Arial,sans-serif;color:#333;margin-top:6px;">${esc(x.description)}</div>
            <div style="font:400 13px/1.5 Arial,sans-serif;color:${MUTED};margin-top:5px;"><b style="color:#444;">How to engage:</b> ${esc(x.howToEngage)}</div>
            <div style="font:400 12px/1.5 Arial,sans-serif;color:${RED};background:#fdf0ef;border-radius:6px;padding:8px 10px;margin-top:8px;">${esc(x.respectfulTip)}</div>
          </td></tr></table>
        </td></tr>`
        )
        .join("")
    : "";

  const phrases = it.phrases.length
    ? sectionLabel("Speak a little", "Handy local phrases") +
      `<tr><td style="padding-top:8px;">${it.phrases
        .map(
          (p) =>
            `<div style="font:400 14px/1.7 Arial,sans-serif;color:${INK};"><b>${esc(p.phrase)}</b> <span style="color:${MUTED};">&mdash; ${esc(p.meaning)}</span></div>`
        )
        .join("")}</td></tr>`
    : "";

  const etiquette = it.etiquette.length
    ? sectionLabel("Travel with respect", "Cultural etiquette") +
      `<tr><td style="padding-top:8px;">${it.etiquette
        .map(
          (e) =>
            `<div style="font:400 14px/1.6 Arial,sans-serif;color:#333;padding-left:14px;position:relative;margin-top:4px;"><span style="color:${RED};position:absolute;left:0;">&bull;</span> ${esc(e)}</div>`
        )
        .join("")}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f2f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
        <!-- header -->
        <tr><td style="padding:22px 32px;border-bottom:1px solid ${LINE};">
          <span style="font:700 13px/1 'Courier New',monospace;letter-spacing:3px;text-transform:uppercase;color:${INK};">WANDER<span style="color:${RED};">LORE</span></span>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:28px 32px 34px;">
          <div style="font:600 11px/1 'Courier New',monospace;letter-spacing:2px;text-transform:uppercase;color:${MUTED};">A cultural portrait of</div>
          <h1 style="font:700 28px/1.15 Arial,sans-serif;color:${INK};margin:8px 0 18px;">${esc(it.destinationFull)}</h1>
          ${story}
          ${
            it.heritageSummary
              ? `<div style="border-left:3px solid ${RED};background:#fdf0ef;padding:12px 16px;margin:8px 0 4px;">
                  <div style="font:600 10px/1 'Courier New',monospace;letter-spacing:2px;text-transform:uppercase;color:${RED};">Heritage</div>
                  <div style="font:400 14px/1.6 Arial,sans-serif;color:#333;margin-top:6px;">${esc(it.heritageSummary)}</div>
                </div>`
              : ""
          }

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${sectionLabel("Day by day", "Your cultural itinerary")}
            ${days}
            ${secrets}
            ${events}
            ${experiences}
            ${phrases}
            ${etiquette}
          </table>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid ${LINE};background:#fafafa;">
          <div style="font:400 11px/1.6 'Courier New',monospace;color:#999;">
            Generated by Google Gemini &middot; places verified on OpenStreetMap &middot; heritage from Wikipedia.<br>
            AI can make mistakes &mdash; verify opening times and bookings before you travel.
          </div>
        </td></tr>
      </table>
      <div style="font:400 11px/1.6 Arial,sans-serif;color:#aaa;margin-top:14px;">Wanderlore &middot; H2S PromptWars</div>
    </td></tr>
  </table>
</body></html>`;
}
