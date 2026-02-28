import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const species = [
    { slug: "snoek", displayName: "Snoek" },
    { slug: "snoekbaars", displayName: "Snoekbaars" },
    { slug: "baars", displayName: "Baars" },
    { slug: "karper", displayName: "Karper" },
    { slug: "meerval", displayName: "Meerval" }
];
async function main() {
    for (const item of species) {
        await prisma.species.upsert({
            where: { slug: item.slug },
            update: { displayName: item.displayName },
            create: item
        });
    }
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
