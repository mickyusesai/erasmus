import { PrismaClient, ParticipantStatus, DocumentType, TransportMode } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create super admin
  const superAdminPassword = 'admin123!';
  const superAdminHash = await bcrypt.hash(superAdminPassword, 10);

  const superAdmin = await prisma.superAdmin.create({
    data: {
      email: 'admin@easyreimburse.com',
      passwordHash: superAdminHash,
      name: 'Super Admin',
    },
  });
  console.log('Created super admin:', superAdmin.email);

  // Create demo organisation with credentials
  const orgPassword = 'demo123!';
  const orgPasswordHash = await bcrypt.hash(orgPassword, 10);

  const org = await prisma.organisation.create({
    data: {
      name: 'Youth Exchange Network',
      email: 'demo@youthexchange.org',
      passwordHash: orgPasswordHash,
      projectCredits: 5,  // Give some credits for testing
      foundingCreditClaimed: true,
      foundingCreditUsed: true,
    },
  });
  console.log('Created organisation:', org.name);

  // Create projects
  const project1 = await prisma.project.create({
    data: {
      organisationId: org.id,
      name: 'Youth Exchange Barcelona 2026',
      description: 'A 7-day youth exchange bringing together young people from across Europe to discuss sustainable development and climate action.',
      country: 'Spain',
      startDate: new Date('2026-09-15'),
      endDate: new Date('2026-09-22'),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      organisationId: org.id,
      name: 'Training Course Berlin 2026',
      description: 'Training course for youth workers on digital tools for non-formal education.',
      country: 'Germany',
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-07'),
    },
  });
  console.log('Created projects');

  // Create country limits for project 1
  const countries = [
    { country: 'Poland', amount: 275 },
    { country: 'Germany', amount: 180 },
    { country: 'Italy', amount: 275 },
    { country: 'Romania', amount: 320 },
    { country: 'Portugal', amount: 275 },
    { country: 'Czech Republic', amount: 275 },
    { country: 'Netherlands', amount: 180 },
    { country: 'France', amount: 180 },
  ];

  for (const { country, amount } of countries) {
    await prisma.projectCountryLimit.create({
      data: {
        projectId: project1.id,
        country,
        maxReimbursementAmount: amount,
        currency: 'EUR',
      },
    });
  }
  console.log('Created country limits');

  // Create participants for project 1
  const participants = [
    { firstName: 'Anna', lastName: 'Kowalska', email: 'anna.kowalska@example.com', country: 'Poland', status: ParticipantStatus.PAID },
    { firstName: 'Jan', lastName: 'Nowak', email: 'jan.nowak@example.com', country: 'Poland', status: ParticipantStatus.ADMIN_APPROVED },
    { firstName: 'Maria', lastName: 'Schmidt', email: 'maria.schmidt@example.com', country: 'Germany', status: ParticipantStatus.PARTICIPANT_COMPLETE },
    { firstName: 'Giovanni', lastName: 'Rossi', email: 'giovanni.rossi@example.com', country: 'Italy', status: ParticipantStatus.PARTICIPANT_COMPLETE },
    { firstName: 'Elena', lastName: 'Popescu', email: 'elena.popescu@example.com', country: 'Romania', status: ParticipantStatus.DRAFT },
    { firstName: 'Pedro', lastName: 'Santos', email: 'pedro.santos@example.com', country: 'Portugal', status: ParticipantStatus.DRAFT },
    { firstName: 'Lucie', lastName: 'Novakova', email: 'lucie.novakova@example.com', country: 'Czech Republic', status: ParticipantStatus.DRAFT },
    { firstName: 'Sophie', lastName: 'de Vries', email: 'sophie.devries@example.com', country: 'Netherlands', status: ParticipantStatus.DRAFT },
  ];

  for (const p of participants) {
    const participant = await prisma.participant.create({
      data: {
        projectId: project1.id,
        ...p,
        magicLinkToken: uuidv4(),
        magicLinkActive: true,
        bankAccountIban: p.status !== ParticipantStatus.DRAFT ? `PL${Math.random().toString().slice(2, 28)}` : null,
        bankAccountHolderName: p.status !== ParticipantStatus.DRAFT ? `${p.firstName} ${p.lastName}` : null,
      },
    });

    // Create reimbursement summary
    const countryLimit = countries.find((c) => c.country === p.country);
    const totalEur = Math.round(Math.random() * 200 + 50);

    await prisma.reimbursementSummary.create({
      data: {
        participantId: participant.id,
        totalEur,
        maxReimbursementAllowed: countryLimit?.amount || 275,
        amountToReimburse: Math.min(totalEur, countryLimit?.amount || 275),
        aiCheckOk: p.status !== ParticipantStatus.DRAFT,
        adminApproved: p.status === ParticipantStatus.ADMIN_APPROVED || p.status === ParticipantStatus.PAID,
        paid: p.status === ParticipantStatus.PAID,
      },
    });

    // Create travel items for non-draft participants
    if (p.status !== ParticipantStatus.DRAFT) {
      await prisma.travelItem.create({
        data: {
          participantId: participant.id,
          modeOfTransport: TransportMode.PLANE,
          fromLocation: p.country === 'Poland' ? 'Warsaw' : p.country === 'Germany' ? 'Berlin' : p.country === 'Italy' ? 'Rome' : 'Home City',
          toLocation: 'Barcelona',
          departureDate: new Date('2026-09-15'),
          arrivalDate: new Date('2026-09-15'),
          flightNumber: `FR${Math.floor(Math.random() * 9000 + 1000)}`,
          bookingReference: `ABC${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          amountOriginal: totalEur * 0.6,
          currencyOriginal: 'EUR',
          amountEur: totalEur * 0.6,
        },
      });

      await prisma.travelItem.create({
        data: {
          participantId: participant.id,
          modeOfTransport: TransportMode.PLANE,
          fromLocation: 'Barcelona',
          toLocation: p.country === 'Poland' ? 'Warsaw' : p.country === 'Germany' ? 'Berlin' : p.country === 'Italy' ? 'Rome' : 'Home City',
          departureDate: new Date('2026-09-22'),
          arrivalDate: new Date('2026-09-22'),
          flightNumber: `FR${Math.floor(Math.random() * 9000 + 1000)}`,
          bookingReference: `ABC${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          amountOriginal: totalEur * 0.4,
          currencyOriginal: 'EUR',
          amountEur: totalEur * 0.4,
        },
      });
    }

    console.log(`Created participant: ${participant.firstName} ${participant.lastName}`);
  }

  // Create participants for project 2
  const project2Participants = [
    { firstName: 'Thomas', lastName: 'Mueller', email: 'thomas.mueller@example.com', country: 'Germany', status: ParticipantStatus.DRAFT },
    { firstName: 'Claire', lastName: 'Dupont', email: 'claire.dupont@example.com', country: 'France', status: ParticipantStatus.DRAFT },
  ];

  for (const p of project2Participants) {
    const participant = await prisma.participant.create({
      data: {
        projectId: project2.id,
        ...p,
        magicLinkToken: uuidv4(),
        magicLinkActive: true,
      },
    });

    await prisma.reimbursementSummary.create({
      data: {
        participantId: participant.id,
        totalEur: 0,
        maxReimbursementAllowed: 180,
        amountToReimburse: 0,
      },
    });

    console.log(`Created participant: ${participant.firstName} ${participant.lastName}`);
  }

  console.log('\nSeeding completed!');

  console.log('\n=== LOGIN CREDENTIALS ===');
  console.log('\nSuper Admin:');
  console.log('  Email: admin@easyreimburse.com');
  console.log('  Password: admin123!');
  console.log('\nDemo Organisation:');
  console.log('  Email: demo@youthexchange.org');
  console.log('  Password: demo123!');

  console.log('\nDemo magic link tokens:');

  const demoParticipants = await prisma.participant.findMany({
    take: 3,
    select: { firstName: true, lastName: true, magicLinkToken: true },
  });

  for (const p of demoParticipants) {
    console.log(`  ${p.firstName} ${p.lastName}: http://localhost:5173/reimbursement?token=${p.magicLinkToken}`);
  }
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
