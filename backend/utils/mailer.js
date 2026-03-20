// ─── utils/mailer.js ───
// Sends email notifications using Nodemailer + Gmail SMTP.
// Called when admin confirms a match between a lost and found item.

const nodemailer = require('nodemailer');

// Create a reusable transporter using Gmail SMTP
// Credentials come from .env (GMAIL_USER and GMAIL_PASS)
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS  // Use a Gmail App Password, NOT your regular password
    }
  });
}

/**
 * Send notification emails to both the owner and the finder when a match is confirmed.
 *
 * @param {Object} lostItem - The lost item record (includes owner name, email, item details)
 * @param {Object} foundItem - The found item record (includes finder name, email, item details)
 */
async function sendMatchEmails(lostItem, foundItem) {
  const transporter = createTransporter();

  // ─── Email to the OWNER (person who lost the item) ───
  const ownerEmail = {
    from: `"CampusFoundIt" <${process.env.GMAIL_USER}>`,
    to: lostItem.email,
    subject: `Good news — possible match found for your ${lostItem.item_name}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1C1C1C; color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; letter-spacing: 1px;">CAMPUSFOUNDIT</h1>
          <p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px; text-transform: uppercase;">NMIMS Mumbai Official Lost & Found</p>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #1C1C1C; margin-top: 0; font-size: 22px;">Great news, ${lostItem.name}! 🎉</h2>
          <p style="color: #4b5563; line-height: 1.6;">We have identified a high-probability match for your lost <strong>${lostItem.item_name}</strong> in the CampusFoundIt directory.</p>
          <div style="background: #fdf2f2; border-left: 4px solid #A11C20; padding: 20px; margin: 24px 0; border-radius: 4px;">
            <h3 style="margin-top: 0; color: #A11C20; font-size: 16px; text-transform: uppercase;">Item Matches Your Report:</h3>
            <ul style="padding-left: 20px; color: #1f2937; margin-bottom: 0; line-height: 1.5;">
              <li><strong>Item:</strong> ${lostItem.item_name}</li>
              <li><strong>Category:</strong> ${lostItem.category}</li>
              <li><strong>Lost at:</strong> ${lostItem.location_lost}</li>
            </ul>
          </div>
          <div style="background: #1C1C1C; color: white; padding: 20px; border-radius: 6px; text-align: center; margin-top: 30px;">
            <p style="margin: 0; font-weight: 600;">How to Claim:</p>
            <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Visit the NMIMS Admin Office. Answer your private verification question to secure the handoff. <strong>Bring student ID.</strong></p>
          </div>
        </div>
        <div style="text-align: center; padding: 24px; color: #9ca3af; font-size: 12px;">
          <p>© 2026 SVKM's NMIMS • CampusFoundIt Framework</p>
        </div>
      </div>
    `
  };

  // ─── Email to the FINDER (person who found the item) ───
  const finderEmail = {
    from: `"CampusFoundIt" <${process.env.GMAIL_USER}>`,
    to: foundItem.email,
    subject: `Update: Match confirmed for found ${foundItem.item_name}`,
    html: `
      <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1C1C1C; color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px; letter-spacing: 1px;">CAMPUSFOUNDIT</h1>
          <p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px; text-transform: uppercase;">NMIMS Mumbai Official Lost & Found</p>
        </div>
        <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
          <h2 style="color: #1C1C1C; margin-top: 0; font-size: 22px;">Thank you, ${foundItem.name}! 🙏</h2>
          <p style="color: #4b5563; line-height: 1.6;">Your contribution has successfully helped return an item to its owner. We have notified them of the match.</p>
          <div style="background: #ecfdf5; border-left: 4px solid #059669; padding: 20px; margin: 24px 0; border-radius: 4px;">
            <p style="margin: 0; color: #065f46; font-weight: 600;">
              Impact: Verified Owner Notified.
            </p>
            <p style="margin: 8px 0 0; color: #065f46; font-size: 14px;">
              Thank you for upholding the integrity of the NMIMS campus community.
            </p>
          </div>
        </div>
        <div style="text-align: center; padding: 24px; color: #9ca3af; font-size: 12px;">
          <p>© 2026 SVKM's NMIMS • CampusFoundIt Framework</p>
        </div>
      </div>
    `
  };

  // Send both emails
  await Promise.all([
    transporter.sendMail(ownerEmail),
    transporter.sendMail(finderEmail)
  ]);

  console.log(`✉️ Emails sent to ${lostItem.email} (owner) and ${foundItem.email} (finder)`);
}

module.exports = { sendMatchEmails };
