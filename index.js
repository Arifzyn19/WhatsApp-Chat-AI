import pino from "pino";
import path from "path";
import CFonts from "cfonts";
import fs from "fs";
import chalk from "chalk";
import readline from "readline";

import moment from "moment-timezone";
import axios from "axios";
import util from "util";
import cp, { exec as _exec } from "child_process";
let exec = util.promisify(_exec).bind(cp);

import { runGeminiVision } from "./lib/gemini.js";

const {
  default: makeWAclient,
  useMultiFileAuthState,
  delay,
  PHONENUMBER_MCC,
  getContentType,
  jidNormalizedUser,
  makeInMemoryStore,
} = await (await import("@whiskeysockets/baileys")).default;

import serialize, { Client } from "./lib/serialize.js";

function getJakartaDateTime() {
  return moment.tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
}

global.sessionName = "auth-info";
const pairingCode = process.argv.includes("--use-pairing-code");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const logger = pino({
  timestamp: () => `,"time":"${new Date().toJSON()}"`,
}).child({ class: "client" });
logger.level = "fatal";
const store = makeInMemoryStore({ logger });

async function Maelyn() {
  const { state, saveCreds } = await useMultiFileAuthState("./" + sessionName);
  try {
    const client = makeWAclient({
      printQRInTerminal: !pairingCode,
      logger,
      logger: pino({
        level: "silent",
      }),
      browser: ["Mac OS", "chrome", "121.0.6167.159"],
      auth: state,
    });

    store.bind(client.ev);
    await Client({ hisoka: client, store });

    client.ev.on(
      "connection.update",
      async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          try {
            const dateTime = getJakartaDateTime();
            await client.sendMessage(client.user.id, {
              text: `WhatsApp Bot Connected ${dateTime}`,
            });
            console.log(chalk.greenBright("WhatsApp bot connected!"));
          } catch (error) {
            console.error("Error sending file:", error);
            process.exit(1);
          }
        } else if (
          connection === "close" &&
          lastDisconnect &&
          lastDisconnect.error &&
          lastDisconnect.error.output.statusCode &&
          lastDisconnect.error.output.statusCode !== 401
        ) {
          Maelyn();
        }
      },
    );

    client.ev.on("creds.update", saveCreds);

    if (pairingCode && !client.authState.creds.registered) {
      let phoneNumber;
      phoneNumber = await question(
        chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number : `)),
      );
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

      if (
        !Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))
      ) {
        console.log(
          chalk.bgBlack(
            chalk.redBright("Start with your country's WhatsApp code!"),
          ),
        );
        phoneNumber = await question(
          chalk.bgBlack(
            chalk.greenBright(`Please type your WhatsApp number : `),
          ),
        );
        phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
        rl.close();
      }

      setTimeout(async () => {
        try {
          let code = await client.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log(
            chalk.black(chalk.bgGreen(`Your Pairing Code : `)),
            chalk.black(chalk.white(code)),
          );
        } catch (error) {
          console.error("Error requesting pairing code:", error);
          process.exit(1);
        }
      }, 3000);
    }

    client.ev.on("messages.upsert", async ({ messages }) => {
      try {
        if (!messages[0].message) return;
        let m = await serialize(client, messages[0], store);

        let quoted = m.isQuoted ? m.quoted : m;
        let downloadM = async (filename) =>
          await client.downloadMediaMessage(quoted, filename);

        if (m.isBot) return;

        const botNumber = jidNormalizedUser(client.user.jid);
        const tagBot = "@" + botNumber.split("@")[0];
        if (m.body.startsWith(tagBot)) {
          const taggedText = m.body.substring(tagBot.length).trim();
          if (!taggedText) return;

          const prompt = `Kamu adalah Arifzyn AI, yang di buat oleh Arifzyn, ketika memberi response gunakan emot,`;

          if (/image/i.test(quoted.msg.mimetype)) {
            const geminiAPI = await runGeminiVision(
              taggedText,
              await downloadM(),
              quoted.msg.mimetype,
            );
            m.reply(geminiAPI);
          } else {
            const response = await axios.post(
              "https://api.arifzyn.tech/ai/chatGPT3?apikey=AR-Arifzyn19",
              {
                messages: [
                  {
                    role: "system",
                    content: prompt,
                  },
                  {
                    role: "user",
                    content: taggedText,
                  },
                ],
              },
            );

            if (response.data.status !== 200) {
              console.error(response.data);
              return;
            }

            await client.sendMessage(m.from, { text: response.data.result });
          }
        }

        if (
          [">", "eval", "=>"].some((a) =>
            m.command.toLowerCase().startsWith(a),
          ) &&
          m.isOwner
        ) {
          let evalCmd = "";
          try {
            evalCmd = /await/i.test(m.text)
              ? eval("(async() => { " + m.text + " })()")
              : eval(m.text);
          } catch (e) {
            evalCmd = e;
          }
          new Promise(async (resolve, reject) => {
            try {
              resolve(evalCmd);
            } catch (err) {
              reject(err);
            }
          })
            ?.then((res) => m.reply(util.format(res)))
            ?.catch((err) => {
              let text = util.format(err);
              m.reply(text);
            });
        }
      } catch (err) {
        console.log(err);
      }
    });
  } catch (error) {
    console.error("Error in Maelyn:", error);
  }
}

Maelyn();
