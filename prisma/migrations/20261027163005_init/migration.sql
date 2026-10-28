-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MetricCategory" AS ENUM ('DELIVERY', 'CONVERSION', 'VIDEO', 'ENGAGEMENT');

-- CreateEnum
CREATE TYPE "MetricUnit" AS ENUM ('CURRENCY', 'COUNT', 'PERCENT', 'RATIO', 'SECONDS');

-- CreateEnum
CREATE TYPE "MetaAuthType" AS ENUM ('SYSTEM_USER_TOKEN', 'OAUTH_USER_TOKEN');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'INVALID', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SyncHealth" AS ENUM ('OK', 'DEGRADED', 'FAILING', 'NEVER_SYNCED');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('VIDEO', 'IMAGE', 'CAROUSEL', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MappingMethod" AS ENUM ('MANUAL', 'BULK', 'NAMING_RULE');

-- CreateEnum
CREATE TYPE "NamingSource" AS ENUM ('AD_NAME', 'ADSET_NAME', 'CAMPAIGN_NAME');

-- CreateEnum
CREATE TYPE "NamingMatchField" AS ENUM ('CREATOR_CODE', 'INSTAGRAM_HANDLE');

-- CreateEnum
CREATE TYPE "BreakdownType" AS ENUM ('AGE_GENDER', 'PLATFORM_POSITION', 'DEVICE_PLATFORM', 'COUNTRY', 'REGION');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('STRUCTURE', 'INSIGHTS', 'BREAKDOWNS');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'INITIAL_BACKFILL', 'ATTRIBUTION_REFRESH');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "lastLoginAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "allAdAccounts" BOOLEAN,
    "allCreators" BOOLEAN,
    "maxLookbackDays" INTEGER,
    "earliestDataDate" DATE,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "allAdAccounts" BOOLEAN NOT NULL DEFAULT false,
    "allCreators" BOOLEAN NOT NULL DEFAULT false,
    "maxLookbackDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "user_role" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "user_permission_override" (
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "user_permission_override_pkey" PRIMARY KEY ("userId","permissionKey")
);

-- CreateTable
CREATE TABLE "metric_definition" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "formula" TEXT,
    "category" "MetricCategory" NOT NULL,
    "unit" "MetricUnit" NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "isSupported" BOOLEAN NOT NULL DEFAULT true,
    "unsupportedReason" TEXT,
    "higherIsBetter" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "metric_definition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "role_metric" (
    "roleId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,

    CONSTRAINT "role_metric_pkey" PRIMARY KEY ("roleId","metricKey")
);

-- CreateTable
CREATE TABLE "user_metric_override" (
    "userId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,

    CONSTRAINT "user_metric_override_pkey" PRIMARY KEY ("userId","metricKey")
);

-- CreateTable
CREATE TABLE "user_ad_account_access" (
    "userId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_ad_account_access_pkey" PRIMARY KEY ("userId","adAccountId")
);

-- CreateTable
CREATE TABLE "user_creator_access" (
    "userId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_creator_access_pkey" PRIMARY KEY ("userId","creatorId")
);

-- CreateTable
CREATE TABLE "meta_connection" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "authType" "MetaAuthType" NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "metaUserId" TEXT,
    "metaUserName" TEXT,
    "scopes" TEXT[],
    "tokenExpiresAt" TIMESTAMP(3),
    "dataAccessExpiresAt" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastValidatedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_account" (
    "id" TEXT NOT NULL,
    "metaAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezoneName" TEXT NOT NULL,
    "accountStatus" INTEGER,
    "businessId" TEXT,
    "businessName" TEXT,
    "connectionId" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "historyStartDate" DATE,
    "backfillQueuedAt" TIMESTAMP(3),
    "lastStructureSyncAt" TIMESTAMP(3),
    "lastInsightsSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastAttributionRefreshAt" TIMESTAMP(3),
    "syncHealth" "SyncHealth" NOT NULL DEFAULT 'NEVER_SYNCED',
    "lastSyncError" TEXT,
    "rateLimitedUntil" TIMESTAMP(3),
    "rateLimitState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign" (
    "id" TEXT NOT NULL,
    "metaCampaignId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "buyingType" TEXT,
    "dailyBudget" DECIMAL(18,4),
    "lifetimeBudget" DECIMAL(18,4),
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_set" (
    "id" TEXT NOT NULL,
    "metaAdSetId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "optimizationGoal" TEXT,
    "billingEvent" TEXT,
    "bidStrategy" TEXT,
    "destinationType" TEXT,
    "dailyBudget" DECIMAL(18,4),
    "lifetimeBudget" DECIMAL(18,4),
    "attributionSpec" JSONB,
    "promotedObject" JSONB,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creative" (
    "id" TEXT NOT NULL,
    "metaCreativeId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "body" TEXT,
    "objectType" TEXT,
    "creativeType" "CreativeType" NOT NULL DEFAULT 'UNKNOWN',
    "thumbnailUrl" TEXT,
    "imageUrl" TEXT,
    "videoId" TEXT,
    "effectiveObjectStoryId" TEXT,
    "instagramPermalinkUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad" (
    "id" TEXT NOT NULL,
    "metaAdId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,
    "effectiveStatus" TEXT,
    "metaCreativeId" TEXT,
    "creativeId" TEXT,
    "previewShareableLink" TEXT,
    "metaCreatedTime" TIMESTAMP(3),
    "metaUpdatedTime" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instagramHandle" TEXT,
    "profileImageUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "team" TEXT,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_asset" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creativeType" "CreativeType" NOT NULL DEFAULT 'UNKNOWN',
    "contentAngle" TEXT,
    "hook" TEXT,
    "product" TEXT,
    "tags" TEXT[],
    "launchDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creative_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creator_mapping" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "creativeAssetId" TEXT,
    "method" "MappingMethod" NOT NULL,
    "namingRuleId" TEXT,
    "mappedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creator_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapping_change" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "previousCreatorId" TEXT,
    "newCreatorId" TEXT,
    "previousAssetId" TEXT,
    "newAssetId" TEXT,
    "method" "MappingMethod" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mapping_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "naming_rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "NamingSource" NOT NULL,
    "matchField" "NamingMatchField" NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "naming_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insight_daily" (
    "id" BIGSERIAL NOT NULL,
    "adId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "spend" DECIMAL(18,4) NOT NULL,
    "impressions" BIGINT NOT NULL,
    "reach" BIGINT,
    "clicks" BIGINT,
    "linkClicks" BIGINT,
    "outboundClicks" BIGINT,
    "landingPageViews" DECIMAL(18,4),
    "purchases" DECIMAL(18,4),
    "purchaseValue" DECIMAL(18,4),
    "websitePurchases" DECIMAL(18,4),
    "websitePurchaseValue" DECIMAL(18,4),
    "addToCart" DECIMAL(18,4),
    "initiateCheckout" DECIMAL(18,4),
    "viewContent" DECIMAL(18,4),
    "leads" DECIMAL(18,4),
    "completeRegistration" DECIMAL(18,4),
    "videoPlays" DECIMAL(18,4),
    "video3sViews" DECIMAL(18,4),
    "thruplays" DECIMAL(18,4),
    "videoP25" DECIMAL(18,4),
    "videoP50" DECIMAL(18,4),
    "videoP75" DECIMAL(18,4),
    "videoP95" DECIMAL(18,4),
    "videoP100" DECIMAL(18,4),
    "videoAvgTimeSec" DECIMAL(18,4),
    "postEngagement" DECIMAL(18,4),
    "postReactions" DECIMAL(18,4),
    "postComments" DECIMAL(18,4),
    "postShares" DECIMAL(18,4),
    "postSaves" DECIMAL(18,4),
    "results" DECIMAL(18,4),
    "resultType" TEXT,
    "objective" TEXT,
    "optimizationGoal" TEXT,
    "attributionSetting" TEXT,
    "actionsRaw" JSONB,
    "actionValuesRaw" JSONB,
    "contentHash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "firstFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_insight_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insight_revision" (
    "id" BIGSERIAL NOT NULL,
    "insightId" BIGINT NOT NULL,
    "revision" INTEGER NOT NULL,
    "previousValues" JSONB NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_insight_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_insight_breakdown_daily" (
    "id" BIGSERIAL NOT NULL,
    "adId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "breakdownType" "BreakdownType" NOT NULL,
    "dim1" TEXT NOT NULL,
    "dim2" TEXT NOT NULL DEFAULT '',
    "currency" VARCHAR(3) NOT NULL,
    "spend" DECIMAL(18,4) NOT NULL,
    "impressions" BIGINT NOT NULL,
    "reach" BIGINT,
    "clicks" BIGINT,
    "linkClicks" BIGINT,
    "purchases" DECIMAL(18,4),
    "purchaseValue" DECIMAL(18,4),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_insight_breakdown_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_job" (
    "id" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "type" "SyncJobType" NOT NULL,
    "trigger" "SyncTrigger" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "dateFrom" DATE,
    "dateTo" DATE,
    "breakdownType" "BreakdownType",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "state" JSONB,
    "stats" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_job_event" (
    "id" BIGSERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_job_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_status_idx" ON "user"("status");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokenHash_key" ON "invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "invitation_userId_idx" ON "invitation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE INDEX "user_role_roleId_idx" ON "user_role"("roleId");

-- CreateIndex
CREATE INDEX "user_ad_account_access_adAccountId_idx" ON "user_ad_account_access"("adAccountId");

-- CreateIndex
CREATE INDEX "user_creator_access_creatorId_idx" ON "user_creator_access"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_account_metaAccountId_key" ON "ad_account"("metaAccountId");

-- CreateIndex
CREATE INDEX "ad_account_isDemo_syncEnabled_idx" ON "ad_account"("isDemo", "syncEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_metaCampaignId_key" ON "campaign"("metaCampaignId");

-- CreateIndex
CREATE INDEX "campaign_adAccountId_idx" ON "campaign"("adAccountId");

-- CreateIndex
CREATE INDEX "campaign_name_idx" ON "campaign"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ad_set_metaAdSetId_key" ON "ad_set"("metaAdSetId");

-- CreateIndex
CREATE INDEX "ad_set_adAccountId_idx" ON "ad_set"("adAccountId");

-- CreateIndex
CREATE INDEX "ad_set_campaignId_idx" ON "ad_set"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_creative_metaCreativeId_key" ON "ad_creative"("metaCreativeId");

-- CreateIndex
CREATE INDEX "ad_creative_adAccountId_idx" ON "ad_creative"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_metaAdId_key" ON "ad"("metaAdId");

-- CreateIndex
CREATE INDEX "ad_adAccountId_idx" ON "ad"("adAccountId");

-- CreateIndex
CREATE INDEX "ad_campaignId_idx" ON "ad"("campaignId");

-- CreateIndex
CREATE INDEX "ad_adSetId_idx" ON "ad"("adSetId");

-- CreateIndex
CREATE INDEX "ad_name_idx" ON "ad"("name");

-- CreateIndex
CREATE UNIQUE INDEX "creator_code_key" ON "creator"("code");

-- CreateIndex
CREATE UNIQUE INDEX "creator_instagramHandle_key" ON "creator"("instagramHandle");

-- CreateIndex
CREATE INDEX "creator_name_idx" ON "creator"("name");

-- CreateIndex
CREATE INDEX "creative_asset_creatorId_idx" ON "creative_asset"("creatorId");

-- CreateIndex
CREATE INDEX "creative_asset_product_idx" ON "creative_asset"("product");

-- CreateIndex
CREATE UNIQUE INDEX "ad_creator_mapping_adId_key" ON "ad_creator_mapping"("adId");

-- CreateIndex
CREATE INDEX "ad_creator_mapping_creatorId_idx" ON "ad_creator_mapping"("creatorId");

-- CreateIndex
CREATE INDEX "ad_creator_mapping_creativeAssetId_idx" ON "ad_creator_mapping"("creativeAssetId");

-- CreateIndex
CREATE INDEX "mapping_change_adId_createdAt_idx" ON "mapping_change"("adId", "createdAt");

-- CreateIndex
CREATE INDEX "ad_insight_daily_date_idx" ON "ad_insight_daily"("date");

-- CreateIndex
CREATE INDEX "ad_insight_daily_adAccountId_date_idx" ON "ad_insight_daily"("adAccountId", "date");

-- CreateIndex
CREATE INDEX "ad_insight_daily_campaignId_date_idx" ON "ad_insight_daily"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_insight_daily_adId_date_key" ON "ad_insight_daily"("adId", "date");

-- CreateIndex
CREATE INDEX "ad_insight_revision_insightId_idx" ON "ad_insight_revision"("insightId");

-- CreateIndex
CREATE INDEX "ad_insight_breakdown_daily_adAccountId_breakdownType_date_idx" ON "ad_insight_breakdown_daily"("adAccountId", "breakdownType", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_insight_breakdown_daily_adId_date_breakdownType_dim1_dim_key" ON "ad_insight_breakdown_daily"("adId", "date", "breakdownType", "dim1", "dim2");

-- CreateIndex
CREATE INDEX "sync_job_status_runAfter_priority_idx" ON "sync_job"("status", "runAfter", "priority");

-- CreateIndex
CREATE INDEX "sync_job_adAccountId_createdAt_idx" ON "sync_job"("adAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "sync_job_event_jobId_createdAt_idx" ON "sync_job_event"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_actorId_createdAt_idx" ON "audit_log"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_action_createdAt_idx" ON "audit_log"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_targetType_targetId_idx" ON "audit_log"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_metric" ADD CONSTRAINT "role_metric_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_metric" ADD CONSTRAINT "role_metric_metricKey_fkey" FOREIGN KEY ("metricKey") REFERENCES "metric_definition"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_metric_override" ADD CONSTRAINT "user_metric_override_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_metric_override" ADD CONSTRAINT "user_metric_override_metricKey_fkey" FOREIGN KEY ("metricKey") REFERENCES "metric_definition"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ad_account_access" ADD CONSTRAINT "user_ad_account_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ad_account_access" ADD CONSTRAINT "user_ad_account_access_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_creator_access" ADD CONSTRAINT "user_creator_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_creator_access" ADD CONSTRAINT "user_creator_access_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_account" ADD CONSTRAINT "ad_account_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "meta_connection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_set" ADD CONSTRAINT "ad_set_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creative" ADD CONSTRAINT "ad_creative_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "ad_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad" ADD CONSTRAINT "ad_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "ad_creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator" ADD CONSTRAINT "creator_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_asset" ADD CONSTRAINT "creative_asset_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creator_mapping" ADD CONSTRAINT "ad_creator_mapping_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creator_mapping" ADD CONSTRAINT "ad_creator_mapping_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "creator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_creator_mapping" ADD CONSTRAINT "ad_creator_mapping_creativeAssetId_fkey" FOREIGN KEY ("creativeAssetId") REFERENCES "creative_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_change" ADD CONSTRAINT "mapping_change_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_daily" ADD CONSTRAINT "ad_insight_daily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_daily" ADD CONSTRAINT "ad_insight_daily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_daily" ADD CONSTRAINT "ad_insight_daily_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_daily" ADD CONSTRAINT "ad_insight_daily_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "ad_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_revision" ADD CONSTRAINT "ad_insight_revision_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "ad_insight_daily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_breakdown_daily" ADD CONSTRAINT "ad_insight_breakdown_daily_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_breakdown_daily" ADD CONSTRAINT "ad_insight_breakdown_daily_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "ad_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_job_event" ADD CONSTRAINT "sync_job_event_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "sync_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───── Hand-written additions ─────

-- Only one QUEUED/RUNNING job per unit of work; finished jobs keep their history.
CREATE UNIQUE INDEX "sync_job_active_dedupe_key" ON "sync_job" ("dedupeKey")
  WHERE "status" IN ('QUEUED', 'RUNNING');

-- Fast case-insensitive creator / ad search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "creator_name_trgm" ON "creator" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX "ad_name_trgm" ON "ad" USING gin (lower("name") gin_trgm_ops);

-- Integrity guards that the ORM cannot express.
ALTER TABLE "ad_insight_daily" ADD CONSTRAINT "ad_insight_daily_nonnegative"
  CHECK ("spend" >= 0 AND "impressions" >= 0);
ALTER TABLE "sync_job" ADD CONSTRAINT "sync_job_date_order"
  CHECK ("dateFrom" IS NULL OR "dateTo" IS NULL OR "dateFrom" <= "dateTo");
