-- Up
CREATE TABLE units (
    unit CHAR(44) NOT NULL PRIMARY KEY,
    creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version VARCHAR(3) NOT NULL DEFAULT '1.0',
    alt VARCHAR(3) NOT NULL DEFAULT '1',
    witness_list_unit CHAR(44) NULL,
    last_ball_unit CHAR(44) NULL,
    content_hash CHAR(44) NULL,
    headers_commission INT NOT NULL,
    payload_commission INT NOT NULL,
    is_free TINYINT NOT NULL DEFAULT 1,
    is_on_main_chain TINYINT NOT NULL DEFAULT 0,
    main_chain_index INT NULL, -- when it first appears
    latest_included_mc_index INT NULL, -- latest MC ball that is included in this ball (excluding itself)
    level INT NULL,
    witnessed_level INT NULL,
    is_stable TINYINT NOT NULL DEFAULT 0,
    sequence TEXT CHECK (sequence IN('good','temp-bad','final-bad')) NOT NULL DEFAULT 'good',
    best_parent_unit CHAR(44) NULL,
    CONSTRAINT unitsByLastBallUnit FOREIGN KEY (last_ball_unit) REFERENCES units(unit),
    FOREIGN KEY (best_parent_unit) REFERENCES units(unit),
    CONSTRAINT unitsByWitnessListUnit FOREIGN KEY (witness_list_unit) REFERENCES units(unit)
);
CREATE INDEX byLB ON units(last_ball_unit);
CREATE INDEX byBestParent ON units(best_parent_unit);
CREATE INDEX byWL ON units(witness_list_unit);
CREATE INDEX byMainChain ON units(is_on_main_chain);
CREATE INDEX byMcIndex ON units(main_chain_index);
CREATE INDEX byLimci ON units(latest_included_mc_index);
CREATE INDEX byLevel ON units(level);
CREATE INDEX byFree ON units(is_free);
CREATE INDEX byStableMci ON units(is_stable, main_chain_index);

CREATE TABLE balls (
    ball CHAR(44) NOT NULL PRIMARY KEY, -- sha256 in base64
    creation_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    unit CHAR(44) NOT NULL UNIQUE, -- sha256 in base64
    count_paid_witnesses TINYINT NULL,
    FOREIGN KEY (unit) REFERENCES units(unit)
);
CREATE INDEX byCountPaidWitnesses ON balls(count_paid_witnesses);

-- must be sorted by parent_unit
CREATE TABLE parenthoods (
    child_unit CHAR(44) NOT NULL,
    parent_unit CHAR(44) NOT NULL,
    PRIMARY KEY (parent_unit, child_unit),
    CONSTRAINT parenthoodsByChild FOREIGN KEY (child_unit) REFERENCES units(unit),
    CONSTRAINT parenthoodsByParent FOREIGN KEY (parent_unit) REFERENCES units(unit)
);
CREATE INDEX byChildUnit ON parenthoods(child_unit);

CREATE TABLE definitions (
	definition_chash CHAR(32) NOT NULL PRIMARY KEY,
	definition TEXT NOT NULL,
	has_references TINYINT NOT NULL
);

-- current list of all known from-addresses
CREATE TABLE addresses (
    address CHAR(32) NOT NULL PRIMARY KEY,
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- must be sorted by address
CREATE TABLE unit_authors (
    unit CHAR(44) NOT NULL,
    address CHAR(32) NOT NULL,
    definition_chash CHAR(32) NULL, -- only with 1st ball from this address, and with next ball after definition change
    _mci INT NULL,
    PRIMARY KEY (unit, address),
    FOREIGN KEY (unit) REFERENCES units(unit),
    CONSTRAINT unitAuthorsByAddress FOREIGN KEY (address) REFERENCES addresses(address),
    FOREIGN KEY (definition_chash) REFERENCES definitions(definition_chash)
);
CREATE INDEX byDefinitionChash ON unit_authors(definition_chash);
CREATE INDEX unitAuthorsIndexByAddress ON unit_authors(address);
CREATE INDEX unitAuthorsIndexByAddressDefinitionChash ON unit_authors(address, definition_chash);
CREATE INDEX unitAuthorsIndexByAddressMci ON unit_authors(address, _mci);

CREATE TABLE authentifiers (
    unit CHAR(44) NOT NULL,
    address CHAR(32) NOT NULL,
    path VARCHAR(40) NOT NULL,
    authentifier VARCHAR(4096) NOT NULL,
    PRIMARY KEY (unit, address, path),
    FOREIGN KEY (unit) REFERENCES units(unit),
    CONSTRAINT authentifiersByAddress FOREIGN KEY (address) REFERENCES addresses(address)
);
CREATE INDEX authentifiersIndexByAddress ON authentifiers(address);

-- must be sorted by address
CREATE TABLE unit_witnesses (
    unit CHAR(44) NOT NULL,
    address VARCHAR(32) NOT NULL,
    PRIMARY KEY (unit, address),
    FOREIGN KEY (unit) REFERENCES units(unit)
);
CREATE INDEX byAddress ON unit_witnesses(address);

CREATE TABLE witness_list_hashes (
    witness_list_unit CHAR(44) NOT NULL PRIMARY KEY,
    witness_list_hash CHAR(44) NOT NULL UNIQUE,
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (witness_list_unit) REFERENCES units(unit)
);


-- if this ball wins headers commission from at least one of the included balls, how it is distributed
-- required if more than one author
-- if one author, all commission goes to the author by default
CREATE TABLE earned_headers_commission_recipients (
    unit CHAR(44) NOT NULL,
    address VARCHAR(32) NOT NULL,
    earned_headers_commission_share INT NOT NULL, -- percentage
    PRIMARY KEY (unit, address),
    FOREIGN KEY (unit) REFERENCES units(unit)
);
CREATE INDEX earnedbyAddress ON earned_headers_commission_recipients(address);

CREATE TABLE messages (
    unit CHAR(44) NOT NULL,
    message_index TINYINT NOT NULL,
    app VARCHAR(30) NOT NULL,
    payload_location TEXT CHECK (payload_location IN ('inline','uri','none')) NOT NULL,
    payload_hash VARCHAR(44) NOT NULL,
    payload TEXT NULL,
    payload_uri_hash VARCHAR(44) NULL,
    payload_uri VARCHAR(500) NULL,
    PRIMARY KEY (unit, message_index),
    FOREIGN KEY (unit) REFERENCES units(unit)
);

-- must be sorted by spend_proof
CREATE TABLE spend_proofs (
    unit CHAR(44) NOT NULL,
    message_index TINYINT NOT NULL,
    spend_proof_index TINYINT NOT NULL,
    spend_proof CHAR(44) NOT NULL,
    address CHAR(32) NOT NULL,
    PRIMARY KEY (unit, message_index, spend_proof_index),
    UNIQUE  (spend_proof, unit),
    FOREIGN KEY (unit) REFERENCES units(unit),
    CONSTRAINT spendProofsByAddress FOREIGN KEY (address) REFERENCES addresses(address)
);
CREATE INDEX spendProofsIndexByAddress ON spend_proofs(address);

-- -------------------------
-- Payments

CREATE TABLE inputs (
    unit CHAR(44) NOT NULL,
    message_index TINYINT NOT NULL,
    input_index TINYINT NOT NULL,
    asset CHAR(44) NULL,
    denomination INT NOT NULL DEFAULT 1,
    is_unique TINYINT NULL DEFAULT 1,
    type TEXT CHECK (type IN('transfer','headers_commission','witnessing','issue')) NOT NULL,
    src_unit CHAR(44) NULL, -- transfer
    src_message_index TINYINT NULL, -- transfer
    src_output_index TINYINT NULL, -- transfer
    from_main_chain_index INT NULL, -- witnessing/hc
    to_main_chain_index INT NULL, -- witnessing/hc
    serial_number BIGINT NULL, -- issue
    amount BIGINT NULL, -- issue
    address CHAR(32) NOT NULL,
    PRIMARY KEY (unit, message_index, input_index),
    UNIQUE  (src_unit, src_message_index, src_output_index, is_unique), -- UNIQUE guarantees there'll be no double spend for type=transfer
    UNIQUE  (type, from_main_chain_index, address, is_unique), -- UNIQUE guarantees there'll be no double spend for type=hc/witnessing
    UNIQUE  (asset, denomination, serial_number, address, is_unique), -- UNIQUE guarantees there'll be no double issue
    FOREIGN KEY (unit) REFERENCES units(unit),
    CONSTRAINT inputsBySrcUnit FOREIGN KEY (src_unit) REFERENCES units(unit),
    CONSTRAINT inputsByAddress FOREIGN KEY (address) REFERENCES addresses(address),
    CONSTRAINT inputsByAsset FOREIGN KEY (asset) REFERENCES assets(unit)
);
CREATE INDEX inputsIndexByAddress ON inputs(address);
CREATE INDEX inputsIndexByAddressTypeToMci ON inputs(address, type, to_main_chain_index);
CREATE INDEX inputsIndexByAssetType ON inputs(asset, type);

CREATE TABLE outputs (
    output_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    unit CHAR(44) NOT NULL,
    message_index TINYINT NOT NULL,
    output_index TINYINT NOT NULL,
    asset CHAR(44) NULL,
    denomination INT NOT NULL DEFAULT 1,
    address VARCHAR(32) NULL,  -- NULL if hidden by output_hash
    amount BIGINT NOT NULL,
    blinding CHAR(16) NULL,
    output_hash CHAR(44) NULL,
    is_serial TINYINT NULL, -- NULL if not stable yet
    is_spent TINYINT NOT NULL DEFAULT 0,
    UNIQUE (unit, message_index, output_index),
    FOREIGN KEY (unit) REFERENCES units(unit),
    CONSTRAINT outputsByAsset FOREIGN KEY (asset) REFERENCES assets(unit)
);
CREATE INDEX outputsByAddressSpent ON outputs(address, is_spent);
CREATE INDEX outputsIndexByAsset ON outputs(asset);
CREATE INDEX outputsIsSerial ON outputs(is_serial);

-- ------------
-- Commissions

-- updated immediately after main chain is updated
CREATE TABLE headers_commission_contributions (
    unit CHAR(44) NOT NULL, -- child unit that receives (and optionally redistributes) commission from parent units
    address CHAR(32) NOT NULL, -- address of the commission receiver: author of child unit or address named in earned_headers_commission_recipients
    amount BIGINT NOT NULL,
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (unit, address),
    FOREIGN KEY (unit) REFERENCES units(unit)
);
CREATE INDEX hccbyAddress ON headers_commission_contributions(address);

CREATE TABLE headers_commission_outputs (
    main_chain_index INT NOT NULL,
    address CHAR(32) NOT NULL, -- address of the commission receiver
    amount BIGINT NOT NULL,
    is_spent TINYINT NOT NULL DEFAULT 0,
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (main_chain_index, address)
);
-- CREATE INDEX hcobyAddressSpent ON headers_commission_outputs(address, is_spent);
CREATE UNIQUE INDEX hcobyAddressMci ON headers_commission_outputs(address, main_chain_index);
CREATE UNIQUE INDEX hcobyAddressSpentMci ON headers_commission_outputs(address, is_spent, main_chain_index);

CREATE TABLE paid_witness_events (
    unit CHAR(44) NOT NULL,
    address CHAR(32) NOT NULL, -- witness address
    delay TINYINT NULL, -- NULL if expired
    PRIMARY KEY (unit, address),
    FOREIGN KEY (unit) REFERENCES units(unit),
    FOREIGN KEY (address) REFERENCES addresses(address)
);
CREATE INDEX pweIndexByAddress ON paid_witness_events(address);

CREATE TABLE witnessing_outputs (
    main_chain_index INT NOT NULL,
    address CHAR(32) NOT NULL,
    amount BIGINT NOT NULL,
    is_spent TINYINT NOT NULL DEFAULT 0,
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (main_chain_index, address),
    FOREIGN KEY (address) REFERENCES addresses(address)
);
-- CREATE INDEX byWitnessAddressSpent ON witnessing_outputs(address, is_spent);
CREATE UNIQUE INDEX byWitnessAddressMci ON witnessing_outputs(address, main_chain_index);
CREATE UNIQUE INDEX byWitnessAddressSpentMci ON witnessing_outputs(address, is_spent, main_chain_index);

-- -----------------------
-- wallet tables

-- wallets composed of BIP44 keys, the keys live on different devices, each device knows each other's extended public key
CREATE TABLE wallets (
    wallet CHAR(44) NOT NULL PRIMARY KEY,
    account INT NOT NULL,
    definition_template TEXT NOT NULL,
    creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    full_approval_date TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    ready_date TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP -- when all members notified me that they saw the wallet fully approved
);

CREATE TABLE extended_pubkeys (
	wallet CHAR(44) NOT NULL, -- no FK because xpubkey may arrive earlier than the wallet is approved by the user and written to the db
	extended_pubkey CHAR(112) NULL, -- base58 encoded, see bip32, NULL while pending
	device_address CHAR(33) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	approval_date TIMESTAMP NULL,
	member_ready_date TIMESTAMP NULL, -- when this member notified us that he has collected all member xpubkeys
	PRIMARY KEY (wallet, device_address)
	-- own address is not present in correspondents
--    FOREIGN KEY byDeviceAddress(device_address) REFERENCES correspondent_devices(device_address)
);

CREATE TABLE wallet_signing_paths (
	wallet CHAR(44) NOT NULL, -- no FK because xpubkey may arrive earlier than the wallet is approved by the user and written to the db
	signing_path VARCHAR(255) NULL, -- NULL if xpubkey arrived earlier than the wallet was approved by the user
	device_address CHAR(33) NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (wallet, signing_path),
	FOREIGN KEY (wallet) REFERENCES wallets(wallet)
	-- own address is not present in correspondents
--    FOREIGN KEY byDeviceAddress(device_address) REFERENCES correspondent_devices(device_address)
);

-- BIP44 addresses. Coin type and key are fixed and stored in credentials in localstorage.
-- derivation path is m/44'/0'/key'/is_change/address_index
CREATE TABLE my_addresses (
	address CHAR(32) NOT NULL PRIMARY KEY,
	wallet CHAR(44) NOT NULL,
	is_change TINYINT NOT NULL,
	address_index INT NOT NULL,
	definition TEXT NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (wallet, is_change, address_index),
	FOREIGN KEY (wallet) REFERENCES wallets(wallet)
);

CREATE TABLE my_witnesses (
	address VARCHAR(32) NOT NULL PRIMARY KEY
);

-- Down
DROP TABLE units;
DROP TABLE balls;
DROP TABLE parenthoods;
DROP TABLE definitions;
DROP TABLE unit_authors;
DROP TABLE authentifiers;
DROP TABLE unit_witnesses;
DROP TABLE witness_list_hashes;
DROP TABLE earned_headers_commission_recipients;
DROP TABLE messages;
DROP TABLE spend_proofs;
DROP TABLE inputs;
DROP TABLE outputs;
DROP TABLE addresses;

-- commissions
DROP TABLE headers_commission_contributions;
DROP TABLE headers_commission_outputs;
DROP TABLE paid_witness_events;
DROP TABLE witnessing_outputs;

-- wallet
DROP TABLE wallets;
DROP TABLE extended_pubkeys;
DROP TABLE wallet_signing_paths;
DROP TABLE my_addresses;
DROP TABLE my_witnesses;

-- peers
