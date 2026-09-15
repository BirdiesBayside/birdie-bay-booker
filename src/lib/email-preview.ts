export const DEFAULT_EMAIL_HEADER_HTML = `<tr>
  <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
    <img
      src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603"
      width="140"
      alt="Birdies Bayside"
      style="display:block; width:140px; height:auto; border:0;"
    />
  </td>
</tr>`;

export const DEFAULT_EMAIL_FOOTER_HTML = `<tr>
  <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding-bottom:14px;">
          <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;">
            <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
          </a>
          <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
            <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
          <div><a href="https://maps.app.goo.gl/vTXLZvd8XPZEeRn16" style="color:#FFFFFF; text-decoration:underline;">Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</a></div>
          <div><a href="tel:+61721468442" style="color:#FFFFFF; text-decoration:underline;">(07) 2146 8442</a></div>
          <div><a href="https://birdiesbayside.com.au" style="color:#FFFFFF; text-decoration:underline;">birdiesbayside.com.au</a></div>
          <div style="margin-top:10px; font-size:12px; opacity:0.75;">© Birdies Bayside</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

export const injectPreviewUnsubscribe = (footerHtml: string, url: string) => {
  const linkRow = `
      <tr>
        <td align="center" style="padding-top:12px; font-family:Inter, Arial, sans-serif; font-size:11px; line-height:1.6; color:#FFFFFF;">
          <a href="${url}" style="color:#FFFFFF; text-decoration:underline; opacity:0.7;">Unsubscribe from marketing emails</a>
        </td>
      </tr>
`;
  const tableIndex = footerHtml.lastIndexOf("</table>");
  if (tableIndex !== -1) {
    return footerHtml.slice(0, tableIndex) + linkRow + footerHtml.slice(tableIndex);
  }

  const cellIndex = footerHtml.lastIndexOf("</td>");
  if (cellIndex === -1) return footerHtml;
  return (
    footerHtml.slice(0, cellIndex) +
    `<div style="text-align:center; padding-top:12px; font-family:Inter, Arial, sans-serif; font-size:11px; color:#FFFFFF;"><a href="${url}" style="color:#FFFFFF; text-decoration:underline; opacity:0.7;">Unsubscribe from marketing emails</a></div>` +
    footerHtml.slice(cellIndex)
  );
};