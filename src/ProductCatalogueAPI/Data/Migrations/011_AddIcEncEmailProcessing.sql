-- ProductCatalogue System database only. Apply after 010; never run on S-101/S-128.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.ProductIcEncDeliveryFile', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.ProductIcEncDeliveryFile (
        delivery_id uniqueidentifier NOT NULL,
        file_name varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
        sha256 binary(32) NOT NULL,
        crc varchar(8) COLLATE Latin1_General_100_BIN2 NULL,
        CONSTRAINT PK_ProductIcEncDeliveryFile PRIMARY KEY (delivery_id, file_name),
        CONSTRAINT FK_ProductIcEncDeliveryFile_Delivery FOREIGN KEY (delivery_id) REFERENCES dbo.ProductIcEncDelivery(delivery_id)
    );
    CREATE INDEX IX_ProductIcEncDeliveryFile_Name ON dbo.ProductIcEncDeliveryFile(file_name);
END;

IF OBJECT_ID(N'dbo.IcEncMailboxSync', N'U') IS NULL
    CREATE TABLE dbo.IcEncMailboxSync (
        mailbox_key char(64) NOT NULL CONSTRAINT PK_IcEncMailboxSync PRIMARY KEY,
        initial_from_utc datetimeoffset(7) NOT NULL,
        cursor_url nvarchar(max) NULL,
        next_poll_at_utc datetime2(7) NOT NULL,
        updated_at_utc datetime2(7) NOT NULL
    );

IF OBJECT_ID(N'dbo.IcEncInboundEmail', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.IcEncInboundEmail (
        inbound_id uniqueidentifier NOT NULL CONSTRAINT PK_IcEncInboundEmail PRIMARY KEY,
        mailbox_key char(64) NOT NULL,
        transport_id_hash binary(32) NOT NULL,
        received_at_utc datetimeoffset(7) NOT NULL,
        message_json nvarchar(max) NOT NULL,
        result_json nvarchar(max) NULL,
        review_json nvarchar(max) NULL,
        status varchar(16) NOT NULL CONSTRAINT DF_IcEncInboundEmail_Status DEFAULT 'Pending',
        delivery_id uniqueidentifier NULL,
        revision_id uniqueidentifier NULL,
        attempts int NOT NULL CONSTRAINT DF_IcEncInboundEmail_Attempts DEFAULT 0,
        next_attempt_at_utc datetime2(7) NOT NULL,
        last_error_code varchar(64) NULL,
        created_at_utc datetime2(7) NOT NULL,
        updated_at_utc datetime2(7) NOT NULL,
        CONSTRAINT UX_IcEncInboundEmail_Message UNIQUE (mailbox_key, transport_id_hash),
        CONSTRAINT CK_IcEncInboundEmail_MessageJson CHECK (ISJSON(message_json) = 1),
        CONSTRAINT CK_IcEncInboundEmail_ResultJson CHECK (result_json IS NULL OR ISJSON(result_json) = 1),
        CONSTRAINT CK_IcEncInboundEmail_ReviewJson CHECK (review_json IS NULL OR ISJSON(review_json) = 1),
        CONSTRAINT CK_IcEncInboundEmail_Status CHECK (status IN ('Pending', 'Review', 'Applied', 'Recorded', 'DryRun', 'Dismissed'))
    );
    CREATE INDEX IX_IcEncInboundEmail_Pending ON dbo.IcEncInboundEmail(status, next_attempt_at_utc);
    CREATE INDEX IX_IcEncInboundEmail_Delivery ON dbo.IcEncInboundEmail(delivery_id, received_at_utc);
END;

-- Existing sends deliberately receive no guessed manifest. Their notices require the existing manual fallback.
COMMIT TRANSACTION;
