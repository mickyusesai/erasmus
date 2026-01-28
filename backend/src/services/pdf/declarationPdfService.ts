import PDFDocument from 'pdfkit';
import { getStorageService } from '../storage/index.js';
import { v4 as uuidv4 } from 'uuid';

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
 * Generate a Declaration of Travel PDF
 */
export async function generateDeclarationPdf(
  participantId: string,
  data: DeclarationData
): Promise<{ filePath: string; fileName: string }> {
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

          resolve({ filePath: storagePath, fileName });
        } catch (error) {
          reject(error);
        }
      });

      doc.on('error', reject);

      // Title
      doc.fontSize(18).font('Helvetica-Bold').text('DECLARATION OF TRAVEL', { align: 'center' });
      doc.moveDown(2);

      // Declaration text
      const transportMode = getTransportModeDisplay(data.modeOfTransport);
      let declarationText = `I, ${data.name}, hereby declare that I took the ${transportMode} from ${data.fromPlace} to ${data.toPlace} on ${formatDate(data.travelDate)}`;

      // Add flight number if applicable
      if (data.flightNumber && data.modeOfTransport === 'PLANE') {
        declarationText += ` with flight number ${data.flightNumber}`;
      }

      // Add booking reference if available
      if (data.bookingReference) {
        declarationText += ` and booking reference ${data.bookingReference}`;
      }

      declarationText += '.';

      doc.fontSize(12).font('Helvetica').text(declarationText, {
        align: 'justify',
        lineGap: 4,
      });

      doc.moveDown(2);

      // Personal details section
      doc.fontSize(14).font('Helvetica-Bold').text('My details are:');
      doc.moveDown(0.5);

      doc.fontSize(12).font('Helvetica');

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
      doc.fontSize(14).font('Helvetica-Bold').text('Sending Organisation:');
      doc.moveDown(0.5);

      doc.fontSize(12).font('Helvetica');

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
      doc.fontSize(14).font('Helvetica-Bold').text('Signature:');
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
      doc.fontSize(12).font('Helvetica').text(`Date: ${formatDate(new Date())}`, { align: 'left' });

      // Footer with disclaimer
      doc.moveDown(3);
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#666666');
      doc.text(
        'This declaration is provided in lieu of a boarding pass that could not be obtained. ' +
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
