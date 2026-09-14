import PDFDocument from 'pdfkit';
import { getStorageService } from '../storage/index.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

// Liberation Sans: Unicode-capable, metrically compatible with Helvetica
// Supports Romanian (ș, ț, ă, î, â), Polish, Czech, and other Latin-extended characters
const BUNDLED_FONT_DIR = path.join(__dirname, 'fonts');
const SYSTEM_FONT_DIR = '/usr/share/fonts/truetype/liberation';
// Use bundled fonts if available (copied during build), fall back to system fonts
const FONT_DIR = fs.existsSync(path.join(BUNDLED_FONT_DIR, 'LiberationSans-Regular.ttf'))
  ? BUNDLED_FONT_DIR
  : SYSTEM_FONT_DIR;
const FONT_REGULAR = path.join(FONT_DIR, 'LiberationSans-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'LiberationSans-Bold.ttf');
const FONT_ITALIC = path.join(FONT_DIR, 'LiberationSans-Italic.ttf');

interface DeclarationData {
  name: string;
  modeOfTransport: string;
  fromPlace: string;
  toPlace: string;
  travelDate: Date;
  flightNumber?: string | null;
  bookingReference?: string | null;
  dateOfBirth: string;
  idNumber: string;
  sendingOrgName: string;
  sendingOrgOid?: string | null;
  sendingOrgAddress: string;
  signatureDataUrl: string;
  // New fields
  reason?: string | null;
  isCarTravel?: boolean;
  licensePlate?: string | null;
  driverName?: string | null;
  distanceKm?: number | null;
}

/**
 * Format date as DD/MM/YYYY
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Get transport mode display name
 */
function getTransportModeDisplay(mode: string): string {
  const modes: Record<string, string> = {
    PLANE: 'flight',
    TRAIN: 'train',
    BUS: 'bus',
    CAR: 'car',
    FERRY: 'ferry',
    OTHER: 'transport',
  };
  return modes[mode] || 'transport';
}

/**
 * Generate a Declaration on Honor PDF
 */
export async function generateDeclarationPdf(
  participantId: string,
  data: DeclarationData
): Promise<{ filePath: string; fileName: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);

          // Generate file path
          const fileName = `Declaration_${data.name.replace(/\s+/g, '_')}_${formatDate(data.travelDate).replace(/\//g, '-')}.pdf`;
          const storagePath = `participants/${participantId}/declarations/${uuidv4()}.pdf`;

          // Store the PDF
          const storage = getStorageService();
          await storage.store(
            {
              buffer: pdfBuffer,
              originalname: fileName,
              mimetype: 'application/pdf',
              size: pdfBuffer.length,
            },
            storagePath
          );

          resolve({ filePath: storagePath, fileName, fileSize: pdfBuffer.length });
        } catch (error) {
          reject(error);
        }
      });

      doc.on('error', reject);

      // Register Unicode-capable fonts
      doc.registerFont('MainFont', FONT_REGULAR);
      doc.registerFont('MainFont-Bold', FONT_BOLD);
      doc.registerFont('MainFont-Italic', FONT_ITALIC);

      // Title
      doc.fontSize(18).font('MainFont-Bold').text('DECLARATION ON HONOR', { align: 'center' });
      doc.moveDown(2);

      // Declaration text varies by transport mode
      const transportMode = getTransportModeDisplay(data.modeOfTransport);
      let declarationText: string;

      if (data.isCarTravel || data.modeOfTransport === 'CAR') {
        // Car travel declaration
        declarationText = `I, ${data.name}, hereby declare on my honor that I traveled by ${transportMode} from ${data.fromPlace} to ${data.toPlace} on ${formatDate(data.travelDate)}.`;

        if (data.licensePlate) {
          declarationText += ` The vehicle license plate number is ${data.licensePlate}.`;
        }
        if (data.driverName) {
          declarationText += ` The driver of the vehicle was ${data.driverName}.`;
        }
        if (data.distanceKm) {
          declarationText += ` The total distance traveled was approximately ${data.distanceKm} km.`;
        }
      } else {
        // Standard travel declaration
        declarationText = `I, ${data.name}, hereby declare on my honor that I took the ${transportMode} from ${data.fromPlace} to ${data.toPlace} on ${formatDate(data.travelDate)}`;

        // Add flight number if applicable
        if (data.flightNumber && data.modeOfTransport === 'PLANE') {
          declarationText += ` with flight number ${data.flightNumber}`;
        }

        // Add booking reference if available
        if (data.bookingReference) {
          declarationText += ` and booking reference ${data.bookingReference}`;
        }

        declarationText += '.';
      }

      doc.fontSize(12).font('MainFont').text(declarationText, {
        align: 'justify',
        lineGap: 4,
      });

      // Reason for declaration
      if (data.reason) {
        doc.moveDown(1);
        doc.fontSize(12).font('MainFont-Bold').text('Reason for this declaration:');
        doc.moveDown(0.3);
        doc.fontSize(12).font('MainFont').text(data.reason, {
          align: 'justify',
          lineGap: 3,
        });
      }

      doc.moveDown(2);

      // Personal details section
      doc.fontSize(14).font('MainFont-Bold').text('My details are:');
      doc.moveDown(0.5);

      doc.fontSize(12).font('MainFont');

      // Name
      doc.text(`Name: ${data.name}`);
      doc.moveDown(0.3);

      // Date of Birth
      doc.text(`Date of Birth: ${data.dateOfBirth}`);
      doc.moveDown(0.3);

      // ID Number
      doc.text(`ID Number: ${data.idNumber}`);
      doc.moveDown(1.5);

      // Sending Organisation section
      doc.fontSize(14).font('MainFont-Bold').text('Sending Organisation:');
      doc.moveDown(0.5);

      doc.fontSize(12).font('MainFont');

      // Organisation Name
      doc.text(`Name: ${data.sendingOrgName}`);
      doc.moveDown(0.3);

      // Organisation OID (if provided)
      if (data.sendingOrgOid) {
        doc.text(`OID: ${data.sendingOrgOid}`);
        doc.moveDown(0.3);
      }

      // Organisation Address
      doc.text(`Address: ${data.sendingOrgAddress}`);
      doc.moveDown(2);

      // Signature section
      doc.fontSize(14).font('MainFont-Bold').text('Signature:');
      doc.moveDown(0.5);

      // Draw signature from base64 data URL
      if (data.signatureDataUrl && data.signatureDataUrl.startsWith('data:image')) {
        try {
          // Extract the base64 data from the data URL
          const base64Data = data.signatureDataUrl.split(',')[1];
          const signatureBuffer = Buffer.from(base64Data, 'base64');

          // Add signature image
          doc.image(signatureBuffer, {
            width: 200,
            height: 80,
          });
        } catch (signatureError) {
          console.error('[PDF] Error adding signature:', signatureError);
          doc.text('[Signature could not be rendered]');
        }
      }

      doc.moveDown(2);

      // Date signed
      doc.fontSize(12).font('MainFont').text(`Date: ${formatDate(new Date())}`, { align: 'left' });

      // Footer with disclaimer
      doc.moveDown(3);
      doc.fontSize(9).font('MainFont-Italic').fillColor('#666666');
      doc.text(
        'This declaration on honor is provided as a sworn statement. ' +
        'The undersigned confirms that the above information is true and accurate to the best of their knowledge.',
        {
          align: 'center',
          lineGap: 2,
        }
      );

      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// =============================================================================
// GREEN TRAVEL DECLARATION (one per participant, signed at submission)
// =============================================================================

export interface GreenTravelTrip {
  modeOfTransport: string;
  fromLocation: string;
  toLocation: string;
  departureDate: Date | null;
  companyName?: string | null;
  bookingReference?: string | null;
  flightNumber?: string | null;
  amountEur?: number | null;
}

export interface GreenTravelDeclarationData {
  name: string;
  country: string;
  projectName: string;
  projectStartDate: Date;
  projectEndDate: Date;
  organisationName: string;
  trips: GreenTravelTrip[];
  travelDaysClaimed?: number | null;
  signatureDataUrl: string;
}

/**
 * Generate the signed green-travel declaration on honour: the participant
 * confirms that low-emission transport was used for the main part of the
 * round trip, lists every leg with its references, and keeps the tickets.
 */
export async function generateGreenTravelDeclarationPdf(
  participantId: string,
  data: GreenTravelDeclarationData
): Promise<{ filePath: string; fileName: string; fileSize: number }> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          const fileName = `Green_Travel_Declaration_${data.name.replace(/\s+/g, '_')}.pdf`;
          const storagePath = `participants/${participantId}/declarations/green-${uuidv4()}.pdf`;
          await getStorageService().store(
            { buffer: pdfBuffer, originalname: fileName, mimetype: 'application/pdf', size: pdfBuffer.length },
            storagePath
          );
          resolve({ filePath: storagePath, fileName, fileSize: pdfBuffer.length });
        } catch (error) {
          reject(error);
        }
      });
      doc.on('error', reject);

      doc.registerFont('MainFont', FONT_REGULAR);
      doc.registerFont('MainFont-Bold', FONT_BOLD);
      doc.registerFont('MainFont-Italic', FONT_ITALIC);

      // Title
      doc.fontSize(18).font('MainFont-Bold').text('GREEN TRAVEL DECLARATION ON HONOUR', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('MainFont').fillColor('#666666')
        .text('Erasmus+ — sustainable means of transport', { align: 'center' });
      doc.fillColor('#000000');
      doc.moveDown(1.5);

      // Statement
      doc.fontSize(11).font('MainFont');
      doc.text(
        `I, ${data.name} (${data.country}), hereby declare on my honour that for my participation in the ` +
        `Erasmus+ project "${data.projectName}" (${formatDate(data.projectStartDate)} – ${formatDate(data.projectEndDate)}), ` +
        `organised by ${data.organisationName}, I used low-emission means of transport (such as train, bus, ` +
        `car-pooling or bicycle) for the main part of my round trip, i.e. for at least half of the distance travelled ` +
        `or for one full direction of the journey.`,
        { align: 'justify', lineGap: 3 }
      );
      doc.moveDown(0.8);
      doc.text('My journey consisted of the following legs:', { lineGap: 3 });
      doc.moveDown(0.5);

      // Trip table (simple rows)
      const colX = [50, 110, 300, 380, 470];
      const header = ['Date', 'Route', 'Transport', 'Reference', 'Amount'];
      doc.fontSize(9).font('MainFont-Bold');
      header.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < header.length - 1, width: (colX[i + 1] ?? 545) - colX[i] }));
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#999999').lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.font('MainFont');
      for (const trip of data.trips) {
        const y = doc.y;
        if (y > 700) { doc.addPage(); }
        const rowY = doc.y;
        const cells = [
          trip.departureDate ? formatDate(trip.departureDate) : '—',
          `${trip.fromLocation} → ${trip.toLocation}`,
          getTransportModeDisplay(trip.modeOfTransport) + (trip.companyName ? ` (${trip.companyName})` : ''),
          [trip.bookingReference, trip.flightNumber].filter(Boolean).join(' / ') || '—',
          trip.amountEur != null ? `€${trip.amountEur.toFixed(2)}` : '—',
        ];
        let maxH = 0;
        cells.forEach((c, i) => {
          const w = (colX[i + 1] ?? 545) - colX[i] - 6;
          const h = doc.heightOfString(c, { width: w });
          doc.text(c, colX[i], rowY, { width: w });
          maxH = Math.max(maxH, h);
        });
        doc.y = rowY + maxH + 6;
      }
      if (data.trips.length === 0) doc.text('No travel items recorded.', 50, doc.y);

      doc.moveDown(1);
      doc.fontSize(11);
      if (data.travelDaysClaimed != null) {
        doc.text(`Extra travel days claimed due to the longer, low-emission journey: ${data.travelDaysClaimed}.`, 50, doc.y, { lineGap: 3 });
        doc.moveDown(0.5);
      }
      doc.text(
        'I confirm that the information above is true and accurate, that I keep the original tickets and receipts ' +
        'for at least five years, and that I will provide them to the organisation or the National Agency on request.',
        50, doc.y, { align: 'justify', lineGap: 3 }
      );

      // Signature
      doc.moveDown(2);
      doc.font('MainFont-Bold').text('Signature:', 50, doc.y);
      doc.moveDown(0.3);
      if (data.signatureDataUrl && data.signatureDataUrl.startsWith('data:image')) {
        try {
          const base64Data = data.signatureDataUrl.split(',')[1];
          const signatureBuffer = Buffer.from(base64Data, 'base64');
          doc.image(signatureBuffer, 50, doc.y, { width: 200, height: 80 });
          doc.y += 90;
        } catch (err) {
          console.error('[Green declaration] Could not embed signature:', err);
          doc.font('MainFont-Italic').text('[Signature could not be embedded]', 50, doc.y);
        }
      }
      doc.font('MainFont').fontSize(10).text(`Signed on ${formatDate(new Date())} by ${data.name}`, 50, doc.y);

      doc.moveDown(3);
      doc.fontSize(9).font('MainFont-Italic').fillColor('#666666');
      doc.text(
        'This declaration on honour serves as supporting documentation for the Erasmus+ green travel top-up and ' +
        'additional travel days, in line with the Erasmus+ Programme Guide.',
        50, doc.y, { align: 'center', lineGap: 2 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
