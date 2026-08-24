import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, TransactionStatus } from '@prisma/client';
import { DateTime } from 'luxon';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');

const adapter = new PrismaPg(DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const PHT = 'Asia/Manila';

async function main(): Promise<void> {
  console.log('Seeding database...');

  await prisma.transaction.deleteMany();
  await prisma.user.deleteMany();

  const [ana, juan, maria, jose, rosa, pedro] = await Promise.all([
    prisma.user.create({ data: { mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' } }),
    prisma.user.create({ data: { mobileNumber: '+639171234002', firstName: 'Juan', lastName: 'Dela Cruz' } }),
    prisma.user.create({ data: { mobileNumber: '+639171234003', firstName: 'Maria', lastName: 'Santos' } }),
    prisma.user.create({ data: { mobileNumber: '+639171234004', firstName: 'Jose', lastName: 'Reyes' } }),
    prisma.user.create({ data: { mobileNumber: '+639171234005', firstName: 'Rosa', lastName: 'Mendoza' } }),
    prisma.user.create({ data: { mobileNumber: '+639171234006', firstName: 'Pedro', lastName: 'Torres' } }),
  ]);

  console.log('Created 6 users');

  const now = DateTime.now().setZone(PHT);
  // Today at 10am PHT — in the daily period
  const todayMorning = now.startOf('day').plus({ hours: 10 }).toJSDate();
  // Today at 2pm PHT — also in the daily period
  const todayAfternoon = now.startOf('day').plus({ hours: 14 }).toJSDate();
  // 1st of this month at 9am PHT — always within the monthly period but typically before today
  const firstOfMonth = now.startOf('month').plus({ hours: 9 }).toJSDate();
  // 2nd of this month at 11am PHT
  const secondOfMonth = now.startOf('month').plus({ days: 1, hours: 11 }).toJSDate();

  const transactions: Array<{
    senderId: string;
    recipientId: string;
    amount: string;
    status: TransactionStatus;
    createdAt: Date;
  }> = [
    // Ana's daily transactions (today) — daily total: ₱12,500.00
    { senderId: ana.id, recipientId: juan.id, amount: '5000.00', status: TransactionStatus.COMPLETED, createdAt: todayMorning },
    { senderId: ana.id, recipientId: maria.id, amount: '7500.00', status: TransactionStatus.COMPLETED, createdAt: todayAfternoon },
    // Ana's earlier-this-month transactions — adds ₱25,000 to monthly total
    { senderId: ana.id, recipientId: jose.id, amount: '10000.00', status: TransactionStatus.COMPLETED, createdAt: firstOfMonth },
    { senderId: ana.id, recipientId: rosa.id, amount: '15000.00', status: TransactionStatus.COMPLETED, createdAt: secondOfMonth },
    // Juan sends today — daily total: ₱3,000.00
    { senderId: juan.id, recipientId: pedro.id, amount: '3000.00', status: TransactionStatus.COMPLETED, createdAt: todayMorning },
    // Juan sends earlier this month
    { senderId: juan.id, recipientId: ana.id, amount: '8000.00', status: TransactionStatus.COMPLETED, createdAt: firstOfMonth },
    // A failed transaction for audit trail (does NOT count toward limits)
    { senderId: maria.id, recipientId: jose.id, amount: '2000.00', status: TransactionStatus.FAILED, createdAt: todayMorning },
    // Rosa is parked ₱20,000 short of the monthly cap, with nothing spent today,
    // so a single Swagger request can demonstrate MONTHLY_LIMIT_EXCEEDED without
    // also tripping the daily cap — see the README's "Testing the monthly limit" section.
    { senderId: rosa.id, recipientId: pedro.id, amount: '480000.00', status: TransactionStatus.COMPLETED, createdAt: firstOfMonth },
  ];

  for (const tx of transactions) {
    await prisma.transaction.create({
      data: {
        senderId: tx.senderId,
        recipientId: tx.recipientId,
        amount: tx.amount,
        currency: 'PHP',
        status: tx.status,
        createdAt: tx.createdAt,
      },
    });
  }

  console.log(`Created ${transactions.length} transactions`);
  console.log('Seeding complete.');
  console.log('');
  console.log('Seed summary:');
  console.log('  Ana Garcia    (+639171234001) — daily spent: ₱12,500 | monthly spent: ₱37,500');
  console.log('  Juan Dela Cruz(+639171234002) — daily spent:  ₱3,000 | monthly spent: ₱11,000');
  console.log('  Maria Santos  (+639171234003) — no completed sends');
  console.log('  Jose Reyes    (+639171234004) — no completed sends');
  console.log('  Rosa Mendoza  (+639171234005) — daily spent:      ₱0 | monthly spent: ₱480,000 (₱20,000 remaining — see README "Testing the monthly limit")');
  console.log('  Pedro Torres  (+639171234006) — no completed sends');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
