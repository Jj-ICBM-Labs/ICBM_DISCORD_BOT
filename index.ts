import * as dotenv from 'dotenv';
dotenv.config();
import { ActionRowBuilder, ActivityType, AttachmentBuilder, ButtonBuilder, ButtonStyle, CacheType, ChannelType, ChatInputCommandInteraction, Client, Colors, EmbedBuilder, GatewayIntentBits, GuildMember, ModalBuilder, PermissionFlagsBits, TextInputBuilder } from 'discord.js';
import { Schema, model, connect } from 'mongoose';
import { Builder, Browser, By, WebElement, until } from 'selenium-webdriver';
import { studentInfoType, env } from "./interface";
import chrome from "selenium-webdriver/chrome";
import speakEasy from 'speakeasy';
import qrCode from 'qrcode';

const envs = process.env as env

const client = new Client({
    intents: Object.keys(GatewayIntentBits).map(x => parseInt(x)).filter(x => !isNaN(x))
});

const studentInfoSchema = new Schema<studentInfoType>({
    duid: String,
    id: String,
    secret: String,
});

const studentInfo = model("studentInfo", studentInfoSchema);

process.on("uncaughtException", (e) => {
    console.error(e.message);
    console.log(e.name);
});

const getQrCode = async (id: string, name: string, interaction: ChatInputCommandInteraction<CacheType>) => {
    const secret = speakEasy.generateSecret({
        length: 20,
        name,
        issuer: id
    });

    const url = speakEasy.otpauthURL({
        secret: secret.ascii,
        issuer: "ICBM",
        label: name,
        algorithm: envs.ALGORITHM,
        period: 30
    });

    qrCode.toDataURL(url, async (err, ImgDat) => {
        if (err) return interaction.reply({ ephemeral: true, content: "오류가 발생하였습니다.\n다시 시도해주세요." });
        else {
            console.log(ImgDat)
            const sfbuff = Buffer.from(ImgDat.split(",")[1], "base64");
            const attachment = new AttachmentBuilder(sfbuff, { name: 'ICBM_OTP.png' });
            const studentData = await studentInfo.findOne({ duid: interaction.user.id });
            console.log(studentData);
            studentData?.set("secret", secret.base32, String);
            studentData?.save();
            interaction.reply({ ephemeral: true, content: "ICBM 웹 전용 OTP입니다.\n재발급이 불가하오니 타인에게 유출되지 않도록 조심해주세요.", files: [attachment] });
        }
    });
}

const getOnstarInfo = async (id: string, pw: string): Promise<{ result: string; success: boolean; }> => {
    /**
     * 로그인에 성공시 반환되는 정보
     * { info: "이름  학과  학년", success: true }
     * 
     * 에러 발생시 반환 정보
     * > 만약 이미 가입된 정보가 있다면
     *      { info : "이미 가입되었던 계정이 있어 인증이 불가능합니다.\n인증을 원하실 경우 에브리타임 쪽지로 캡쳐, 닉네임 + 태그\n예) : 홍길동#1234\n를 보내주세요." , success: false }
     * > 만약 로그인창을 찾을 수 없다면
     *      { info : "로그인 페이지를 불러오지 못했습니다.\n다시 시도해주세요.", success: false }
     * > 오류 발생시
     *      { info : "알 수 없는 오류가 발생하였습니다.\n다시 시도해주세요.", success: false }
     */

    const studentHandler = await studentInfo.findOne({ id: id });
    if (studentHandler) return { result: "이미 가입되었던 계정이 있어 인증이 불가능합니다.\n인증을 원하실 경우 ICBM 2학년 성민우를 찾아주세요.", success: false };
    // member?.ban();
    const icbm_members: string[] = envs.MEMBER_IDS.split(',');
    if (!icbm_members.includes(id)) return { result: "당신은 ICBM의 회원이 아닙니다.", success: false };
    let driver = await new Builder().usingServer('http://localhost:9515')
        .setChromeOptions(new chrome.Options().headless().windowSize({ width: 1920, height: 1080 }))
        .forBrowser(Browser.CHROME).build();
    driver.manage().window().maximize();
    try {
        await driver.get('https://onstar.jj.ac.kr/');
        let idInput: WebElement[] = [], pwInput: WebElement[] = [], loginBtn: WebElement[] = [];


        //  로그인 페이지 핸들링
        await driver.wait(until.elementLocated(By.id('mainframe.VFrameSet.HomeFrame.form.div_Top.form.sta_login:text')), 10000);
        await driver.findElement(By.id("mainframe.VFrameSet.HomeFrame.form.div_Top.form.sta_login:text")).click();
        driver.getTitle().then(t => {
            console.log(t);
        });
        await driver.wait(until.elementLocated(By.id('mainframe.VFrameSet.HomeFrame.LOGIN.form.edt_id:input')), 10000);
        idInput = await driver.findElements(By.id("mainframe.VFrameSet.HomeFrame.LOGIN.form.edt_id:input"));
        pwInput = await driver.findElements(By.id("mainframe.VFrameSet.HomeFrame.LOGIN.form.edt_pw:input"));
        loginBtn = await driver.findElements(By.id("mainframe.VFrameSet.HomeFrame.LOGIN.form.btn_login"));

        if (!idInput[0] || !pwInput[0] || !loginBtn[0]) return { result: "로그인 페이지를 불러오지 못했습니다.\n다시 시도해주세요.", success: false };

        await idInput[0].click();
        await idInput[0].sendKeys(id);
        await pwInput[0].click();
        await pwInput[0].sendKeys(pw);
        await loginBtn[0].click();

        //로그인 여부 확인

        var info;
        await driver.wait(until.elementLocated(By.id('mainframe.VFrameSet.HomeFrame.form.div_Top.form.sta_userInfo:text')), 10000)
            .catch(() => {
                return { error: 2, success: false };
            })
            .then(async () => {
                const getName = async (): Promise<string> => {
                    await driver.wait(until.elementLocated(By.id('mainframe.VFrameSet.HomeFrame.form.div_Top.form.sta_userInfo:text')), 10000);
                    let result = await driver.findElement(By.id("mainframe.VFrameSet.HomeFrame.form.div_Top.form.sta_userInfo:text")).getAttribute("innerText");
                    if (!result.includes(id)) return getName();
                    return result.replace("(" + id + ")", "").replace("[", "").replace("]", "").trim();
                };
                info = await getName();
                return info
            });
        if (info) return { result: info, success: true };
        return { result: "알 수 없는 오류가 발생하였습니다.\n다시 시도해주세요.", success: false };
    } finally {
        await driver.quit();
    }
};

client.once("ready", async () => {
    client.user?.setActivity({
        name: "연구실",
        type: ActivityType.Watching
    });
});

client.on("interactionCreate", async (interaction): Promise<any> => {
    if (interaction.isButton()) {
        const componentCommand = interaction.customId;
        if (componentCommand.startsWith("deleteStudentInfo")) {
            const studentHandler = await studentInfo.findOne({ id: componentCommand.split(" ")[1] });

            studentHandler?.delete();
            interaction.reply({ content: "삭제했습니다.", ephemeral: true });
            return;
        }
        switch (componentCommand) {

            case "instarRegister":
                const Input = [
                    {
                        label: "아이디",
                        customId: "id",
                        placeholder: "전주대 인스타 아이디를 입력해주세요.",
                        required: true,
                        style: 1
                    },
                    {
                        label: "비밀번호",
                        customId: "pw",
                        placeholder: "전주대 인스타 비밀번호를 입력해주세요.",
                        required: true,
                        style: 1
                    }
                ].map(({ label, customId, placeholder, required, style }) => {
                    return new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder({
                            label,
                            customId,
                            placeholder,
                            required,
                            style
                        })
                    );
                });

                await interaction.showModal(new ModalBuilder({
                    title: "인스타 인증하기",
                    customId: "verifyInstar",
                    components: Input
                }));
                break;
            case "instarLogin":
                const embed = new EmbedBuilder({
                    title: "가입전 꼭 확인해주세요!",
                    description: "기본적인 규칙만이 아닌 개인정보 수집 범위 등을 표기하고 있습니다.\n규칙을 다 읽으셨다면 아래 버튼을 통해 로그인 해주세요.\n\n\`로그인시 위 규칙에 명시된 개인정보 수집과 규칙에 대해 동의한 것으로 간주됩니다.\`",
                    color: Colors.Red
                });

                const component = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId("instarRegister").setLabel("로그인하기").setStyle(ButtonStyle.Primary)
                );

                interaction.reply({ embeds: [embed], components: [component], ephemeral: true }).catch(e => { console.log(e) });
                break;
        }
    } else if (interaction.isModalSubmit()) {
        await interaction.deferReply({ ephemeral: true });
        const componentCommand = interaction.customId;
        const fieldDatas = interaction.fields.fields;
        switch (componentCommand) {
            case "support":
                const info = fieldDatas.get("info");

                if (!info) return;
                const memberInfo = interaction.guild?.members.cache.get(interaction.user.id);
                const embed = new EmbedBuilder()
                    .setTitle("건의 도착")
                    .setDescription(info.value)
                    .setAuthor({
                        name: memberInfo?.nickname ?? interaction.user.tag,
                        iconURL: interaction.user.avatarURL()!
                    })
                    .setFooter({ text: interaction.user.id });

                const channel = interaction.guild?.channels.cache.get("1093743841540046939");
                if (channel?.isTextBased()) {
                    channel.send({ embeds: [embed] });
                }
                break;
            case "verifyInstar":
                const id = fieldDatas.get("id");
                const pw = fieldDatas.get("pw");

                if (!id || !pw) {
                    await interaction.editReply({ content: "로그인에 실패하였습니다.\n다시 시도해주세요." });
                } else {
                    let result: { result: string, success: boolean } | string[] = await getOnstarInfo(id.value, pw.value);
                    if (!result.success) return await interaction.editReply({ content: result.result });
                    const info = result.result.split("  "); // ["이름", "학과", "학년"]

                    const member = interaction.member as GuildMember;
                    const guildRoles = member.guild.roles;

                    // 서버 닉네임 본명으로 설정
                    member.setNickname(info[0]);

                    //학년 정보 등록
                    const gradeRole = guildRoles.cache.find(i => i.name == info[2]);
                    if (gradeRole) {
                        member.roles.add(gradeRole);
                    } else if (info[2]) {
                        const role = await guildRoles.create({
                            name: info[2],
                            position: guildRoles.cache.size - 4
                        });
                        member.roles.add(role);
                    };

                    await new studentInfo(
                        {
                            duid: interaction.user.id,
                            id: id.value
                        }
                    ).save();
                }
                break;
        }
    } else if (interaction.isCommand()) {
        const command = interaction.commandName;

        switch (command) {
            case "otp_발급":
                const guildMember = interaction.member as GuildMember;
                const interactionHandle = interaction as ChatInputCommandInteraction
                const getqr = await getQrCode(interaction.user.id, guildMember.nickname ?? guildMember.user.username, interactionHandle);
                break;
            case "계정정보_삭제":
                const id = interaction.options.get("id");

                const studentData = await studentInfo.findOne({ id: id?.value });
                const embed = new EmbedBuilder()
                    .setTitle("정말 삭제하시겠습니까?")
                    .setDescription("학번 : " + studentData?.id);
                const component = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setCustomId("deleteStudentInfo " + id?.value).setLabel("삭제하기").setStyle(ButtonStyle.Primary)
                );

                interaction.reply({ embeds: [embed], components: [component], ephemeral: true }).catch(e => { console.log(e) });
                break;
            case "건의":
                const Input = [
                    {
                        label: "건의 내용",
                        customId: "info",
                        placeholder: "원활한 전주대학교 디스코드 운영을 위한 내용을 공유해주세요.",
                        required: true,
                        style: 2
                    }
                ].map(({ label, customId, placeholder, required, style }) => {
                    return new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder({
                            label,
                            customId,
                            placeholder,
                            required,
                            style,
                            maxLength: 2000
                        })
                    );
                });
                await interaction.showModal(new ModalBuilder({
                    title: "건의",
                    customId: "support",
                    components: Input
                }));
                break;
            case "로그인_폼_등록":
                const channel = interaction.guild?.channels.cache.get(envs.WELCOME_CHANNEL_ID);

                if (channel?.type === ChannelType.GuildText) {
                    const embed = new EmbedBuilder({
                        title: "ICBM 회원 인증",
                        description: "ICBM 연구실의 연구원 여부를 확인하기 위해 인스타 인증기능을 지원하고 있습니다.\n아래 버튼을 눌러 인스타 아이디와 비밀번호를 입력하여 전주대 학생임을 인증해주세요.\n\n\`[아이디와 비밀번호는 인증 이후 기록에서 삭제되오니 걱정하지 마시길 바랍니다.]\n로그인시 학년, 학과 정보가 역할에 적용되며 자동으로 닉네임이 본명으로 변경됩니다.\`",
                        color: Colors.Gold
                    });

                    const component = new ActionRowBuilder<ButtonBuilder>().addComponents(
                        new ButtonBuilder().setCustomId("instarRegister").setLabel("인스타 인증").setStyle(ButtonStyle.Primary)
                    );

                    channel.send({ embeds: [embed], components: [component] }).catch(e => { console.log(e) });
                }
                console.log("Bot is ready");
        }
    }
});

connect(envs.DB_URL).then(() => {
    console.log("Connected to MongoDB");
    client.login(envs.TOKEN);
}).catch(e => console.log("Error connecting to MongoDB", e));
