import Unit from '../core/unit';
import sqlstore from '../storage/sqlstore';
import {Output, TransferInput} from '../core/message';
import logger from '../common/log';

export class Inputs {
    static newTransferInput(unit: Base64, messageIndex: number, outputIndex: number): TransferInput {
        return {
            'type': 'transfer',
            'unit': unit,
            'messageIndex': messageIndex,
            'outputIndex': outputIndex,
        };
    }

    static async read(unit: Base64, messageIndex: number): Promise<TransferInput[]> {
        const rows = await sqlstore.all(`
            SELECT type, denomination, assets.fixed_denominations,
            src_unit AS unit, src_message_index AS message_index, src_output_index AS output_index,
            from_main_chain_index, to_main_chain_index, serial_number, amount, address, asset
            FROM inputs
            LEFT JOIN assets ON asset=assets.unit
            WHERE inputs.unit=? AND inputs.message_index=?
            ORDER BY input_index`,
            unit, messageIndex,
        );

        const inputs = [];
        for (let i = 0; i < rows.length; i++) {
            const input = rows[i];
            inputs.push(Inputs.newTransferInput(input.unit, input.message_index, input.output_index));
        }
        return inputs;
    }

    static async save(unit: Unit) {
        for (let i = 0; i < unit.messages.length; i++) {
            const message = unit.messages[i];
            for (let j = 0; j < message.payload.inputs.length; j++) {
                const input = message.payload.inputs[j];
                let type;
                let srcUnit = null;
                let srcMessageIndex = null;
                let srcOutputIndex = null;
                let fromMCI = null;
                let toMCI = null;
                let amount = null;
                let serialNumber = null;
                const address = unit.authors[0].address;
                switch (input.type) {
                    case 'issue':
                        type = 'issue';
                        amount = input.amount;
                        serialNumber = input.serialNumber;
                        break;
                    case 'headers_commission':
                        type = 'headers_commission';
                        fromMCI = input.fromMCI;
                        toMCI = input.toMCI;
                        break;
                    case 'witness_commission':
                        type = 'witness_commission';
                        fromMCI = input.fromMCI;
                        toMCI = input.toMCI;
                        break;
                    case 'transfer':
                        type = 'transfer';
                        srcUnit = input.unit;
                        srcMessageIndex = input.messageIndex;
                        srcOutputIndex = input.outputIndex;
                }
                const denomination = 1;
                const isUnique = 1;
                const asset = null;


                await sqlstore.run(`
                    INSERT INTO inputs
                    (unit, message_index, input_index, type, 
                    src_unit, src_message_index, src_output_index,
                    from_main_chain_index, to_main_chain_index,
                    denomination, amount, serial_number,
                    asset, is_unique, address) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                    unit.unit, i, j, type,
                    srcUnit, srcMessageIndex, srcOutputIndex,
                    fromMCI, toMCI,
                    denomination, amount, serialNumber,
                    asset, isUnique, address,
                );
            }
        }
    }
}

export class Outputs {
    static async all() {
        return sqlstore.all('SELECT * FROM outputs');
    }

    static async read(unit: Base64, messageIndex: number): Promise<Output[]> {
        const rows = await sqlstore.all( // we don't select blinding because it's absent on public payments
            `SELECT address, amount, asset, denomination
            FROM outputs WHERE unit=? AND message_index=? ORDER BY output_index`,
            [unit, messageIndex],
        );

        const outputs = [];
        for (const output of rows) {
            outputs.push(new Output(output.address, output.amount));
        }
        return outputs;
    }

    static async save(unit: Unit) {
        for (let i = 0; i < unit.messages.length; i++) {
            const message = unit.messages[i];
            for (let j = 0; j < message.payload.outputs.length; j++) {
                const output = message.payload.outputs[j];
                await sqlstore.run(`
                    INSERT INTO outputs
                    (unit, message_index, output_index, address, amount, asset, denomination, is_serial)
                    VALUES(?,?,?,?,?,?,?,1)`,
                    unit.unit, i, j, output.address, output.amount, null, 1,
                );
            }
        }
    }
}

export default class Messages {
    static async read(unit: Base64) {
        const rows = await sqlstore.all(`
            SELECT app, payload_hash, payload_location, payload, payload_uri, payload_uri_hash, message_index
            FROM messages WHERE unit=? ORDER BY message_index`,
            unit,
        );

        const messages = [];
        for (const row of rows) {
            const inputs = await Inputs.read(row.unit, row.messageIndex);
            const outputs = await Outputs.read(row.unit, row.messageIndex);
            const message = row;
            message.payload = {
                inputs: inputs,
                outputs: outputs,
            };
            messages.push(message);
        }

        return messages;
    }

    static async save(unit: Unit) {
        for (let i = 0; i < unit.messages.length; i++) {
            const message = unit.messages[i];
            const payload = JSON.stringify(message.payload);

            await sqlstore.run(`
                INSERT INTO messages
                (unit, message_index, app, payload_hash, payload_location, payload, payload_uri, payload_uri_hash)
                VALUES(?,?,?,?,?,?,?,?)`,
                unit.unit, i, message.app, message.payloadHash, message.payloadLocation, payload, null, null,
            );
        }

        // save inputs
        await Inputs.save(unit);
        // save outputs
        await Outputs.save(unit);
    }
}
