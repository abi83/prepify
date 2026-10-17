-- CreateIndex
CREATE INDEX "Attempt_prepId_userId_idx" ON "Attempt"("prepId", "userId");

-- CreateIndex
CREATE INDEX "Concept_producedByJobId_idx" ON "Concept"("producedByJobId");

-- CreateIndex
CREATE INDEX "Job_prepId_type_status_idx" ON "Job"("prepId", "type", "status");

-- CreateIndex
CREATE INDEX "JobInput_jobId_idx" ON "JobInput"("jobId");

-- CreateIndex
CREATE INDEX "Prep_userId_idx" ON "Prep"("userId");

-- CreateIndex
CREATE INDEX "Prep_visibility_isActive_createdAt_idx" ON "Prep"("visibility", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "PrepImage_prepId_idx" ON "PrepImage"("prepId");

-- CreateIndex
CREATE INDEX "Question_prepId_idx" ON "Question"("prepId");
