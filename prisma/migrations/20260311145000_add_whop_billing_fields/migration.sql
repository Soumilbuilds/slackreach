ALTER TABLE "User" ADD COLUMN "whopMemberId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopMembershipId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopMembershipStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "whopRenewalPeriodEnd" DATETIME;
ALTER TABLE "User" ADD COLUMN "whopCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "whopPlanId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopProductId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopPaymentMethodId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopLastPaymentId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopLastPaymentStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "whopLastPaymentSubstatus" TEXT;
ALTER TABLE "User" ADD COLUMN "whopLastInvoiceId" TEXT;
ALTER TABLE "User" ADD COLUMN "whopLastInvoiceStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "whopLastInvoiceToken" TEXT;

CREATE UNIQUE INDEX "User_whopMemberId_key" ON "User"("whopMemberId");
CREATE UNIQUE INDEX "User_whopMembershipId_key" ON "User"("whopMembershipId");
