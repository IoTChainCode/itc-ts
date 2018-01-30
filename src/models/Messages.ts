import Unit from '../core/unit';
import sqlstore from '../storage/sqlstore';
import {Input, Output} from '../core/message';

export class Inputs {
    static async read(unit: Base64, messageIndex: number): Promise<Input[]> {
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
            inputs.push(new Input(input.unit, input.message_index, input.output_index, input.type));
        }
        return inputs;
    }
}

export class Outputs {
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
}

class SpendProofs {
    static async read(unit: Base64, messageIndex: number): Promise<any[]> {
        const rows = await sqlstore.all(`
            SELECT spend_proof, address FROM spend_proofs WHERE unit=? AND message_index=? ORDER BY spend_proof_index`,
            [unit, messageIndex],
        );

        return rows.map(row => {
            return row;
        });
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
            const spendProofs = await SpendProofs.read(row.unit, row.messageIndex);
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
        if (!unit.contentHash) {
            for (let i = 0; i < unit.messages.length; i++) {
                const message = unit.messages[i];

                await sqlstore.run(`
                INSERT INTO messages
                (unit, message_index, app, payload_hash, payload_location, payload, payload_uri, payload_uri_hash)
                VALUES(?,?,?,?,?,?,?,?)`,
                    unit.unit, i, message.app, message.payloadHash, message.payloadLocation, null, null, null,
                );

                if (message.spendProofs) {
                    for (let j = 0; j < message.spendProofs.length; j++) {
                        const spendProof = message.spendProofs[j];
                        await sqlstore.run(`
                        INSERT INTO spend_proofs (unit, message_index, spend_proof_index, spend_proof, address) VALUES(?,?,?,?,?)`,
                            unit.unit, i, j, spendProof.spend_proof, spendProof.address,
                        );
                    }
                }
            }
        }
    }
}
