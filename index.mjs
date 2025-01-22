import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser } from "@whiskeysockets/baileys";
import cfonts from "cfonts";
import pino from "pino";
import { Boom } from "@hapi/boom";
import chalk from "chalk";
import { promises as fs } from "node:fs";
import path from "node:path";
import qrcodeTerminal from "qrcode-terminal";
const sessionFolder = path.join(".", "WaSessions");

console.log(chalk.green.bold("Iniciando..."));
cfonts.say("Wa Bot", {
    font: "block",
    align: "center",
    gradient: ["blue", "green"]
});
cfonts.say("desarrollado por danixljs", {
    font: "console",
    align: "center",
    color: "cyan"
});
async function startClient() {
    /**
     * version => Es la versión de WhatsApp que utilizará tu cliente.
     * isLatest => Indica si es la última versión.
     */
    const { version, isLatest } = await fetchLatestBaileysVersion();
    /**
     * state => Son las credenciales de tu cliente.
     * saveCreds => Guarda las credenciales necesarias en la carpeta de sesión.
     */
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
    /**
     * Estas son configuraciones simples, puedes visitar "https://baileys.whiskeysockets.io/types/SocketConfig.html" para saber más.
     */
    const wss = makeWASocket({
        markOnlineOnConnect: true,
        defaultQueryTimeoutMs: undefined,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(
                state.keys,
                pino({
                    level: "silent",
                }).child({
                    level: "silent",
                }),
            ),
        },
        logger: pino({
            level: "silent",
        }),
        browser: ["Ubuntu", "Edge", "131.0.2903.86"],
        connectTimeoutMs: 1000 * 60,
        qrTimeout: 1000 * 60,
        syncFullHistory: false,
        printQRInTerminal: false,
        patchMessageBeforeSending: async (message) => {
            try {
                await wss.uploadPreKeysToServerIfRequired();
            } catch (err) {
                console.warn(err);
            }
            return message;
        },
        generateHighQualityLinkPreview: true,
        version,
    });
    /**
     * Esto es para evitar mensajes molestos de las Pre-Keys en la consola.
     */
    console.info = () => { };
    console.debug = () => { };
    /**
     * Esto es para que se guarden las credenciales.
    */
    wss.ev.on("creds.update", saveCreds);
    /**
     * Aquí manejaremos la conexíon y desconexíon del cliente.
    */
    wss.ev.on("connection.update", async ({ lastDisconnect, qr, connection }) => {
        if (qr) {
            console.log(chalk.green.bold(`
╭───────────────────╼
│ ${chalk.cyan("Escanea este código QR para conectarte.")}
╰───────────────────╼`));
            qrcodeTerminal.generate(qr, {
                small: true,
            });
        }
        if (connection === "close") {
            const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
            switch (code) {
                case DisconnectReason.loggedOut:
                case DisconnectReason.badSession:
                case DisconnectReason.forbidden:
                case DisconnectReason.multideviceMismatch:
                    console.log(chalk.red.bold(`
╭───────────────────╼
│ ${chalk.yellow("La sesión se cerró sin posibilidades de reconexión.")}
╰───────────────────╼`));
                    console.log(JSON.stringify(lastDisconnect, null, 2));
                    await fs.rm(sessionFolder, { recursive: true, force: true }).catch(() => void 0);
                    process.exit(1);
                default:
                    console.log(chalk.red.bold(`
╭───────────────────╼
│ ${chalk.yellow(`La sesión se cerró con el código de estado "${chalk.white(code)}", reconéctando.`)}
╰───────────────────╼`));
                    await startClient();
                    break;
            }
        }
        if (connection === "open") {
            const userJid = jidNormalizedUser(wss.user.id);
            const userName = wss.user.name || wss.user.verifiedName || "Desconocido";
            console.log(chalk.green.bold(`
╭───────────────────╼
│ ${chalk.cyan("Conéctado con éxito")}
│
│- ${chalk.cyan("Usuario :")} +${chalk.white(userJid.split("@")[0] + " - " + userName)}; 
│- ${chalk.cyan("Versión de WhatsApp :")} ${chalk.white(version)} es la última ? ${chalk.white(isLatest)} 
╰───────────────────╼`));
        }
    });
    wss.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "notify" && messages && messages.length !== 0) {
            for (const message of messages) {
                if (message.message) {
                    const sender = message.key.fromMe ? jidNormalizedUser(wss.user.id) : message.key.participant || message.key.remoteJid;
                    const chat = message.key.remoteJid;
                    const type = Object.keys(message.message).find((type) => type !== "senderKeyDistributionMessage" && type !== "messageContextInfo");
                    const senderName = message.pushName || message.verifiedBizName || "Desconocido";
                    const body = message.message.conversation || message.message[type]?.text || message.message[type]?.caption || "not supported";
                    console.log(chalk.green.bold(`
╭─────────< Wa Bot - Vs 1.0.0 >──────────╼
│ ${chalk.cyan(`Mensaje recibido`)}
│
│- ${chalk.cyan("Chat :")} ${chalk.white(chat)}
│- ${chalk.cyan("Usuario :")} +${chalk.white(sender.split("@")[0] + " - " + senderName)}
│- ${chalk.cyan("Tipo :")} ${chalk.white(type)};
╰╼
${chalk.whiteBright(body)}`));
                    if (body !== "not supported") {
                        /**
                         * Captura mensajes que comiencen con /
                        */
                        if (/^\//.test(body.trim())) {
                            const bodySplit = body.trim().split(" ");
                            const text = bodySplit.slice(1).join(" ");
                            const args = bodySplit.slice(1);
                            const usedPrefix = bodySplit[0].charAt(0);
                            const command = bodySplit[0].slice(1);
                            switch (usedPrefix + command) {
                                case "/menu":
                                    await wss.sendMessage(chat, { text: "Muy pronto", mentions: [sender] }, { quoted: message });
                                    break;
                                case "/say":
                                    await wss.sendMessage(chat, { text: text, mentions: [sender] }, { quoted: message });
                                    break;
                                default:
                                    const caption = `
- - *Wa Bot - Vs 1.0.0*

> - *Usuario :* @${sender.split("@")[0]}
> - *Mensaje :* ${text}
> - *Argumentos :* ${args}
> - *Prefijo usado :* ${usedPrefix}
> - *Comando ejecutado :* ${command}

_Desarrollado por DanixlJs_`.trim()
                                    await wss.sendMessage(chat, { text: caption, mentions: [sender] }, { quoted: message });
                                    break;
                            }
                        }
                    }
                }
            }
        }
    });
}

/**
 * Iniciamos el cliente.
*/
startClient();