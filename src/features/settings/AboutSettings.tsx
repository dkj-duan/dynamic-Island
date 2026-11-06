import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Row,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  BellOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  CustomerServiceOutlined,
  FolderOpenOutlined,
  GithubOutlined,
  MailOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Section } from "./ui/Section";
import { t } from "../../services/i18n";
import appIcon from "../../assets/app-icon.png";
import { version as packageVersion } from "../../../package.json";

const aboutFeatures = [
  {
    icon: <ClockCircleOutlined />,
    label: "计时器与番茄钟",
    text: "一键开始专注或休息，结束时灵动岛持续提醒。",
  },
  {
    icon: <CustomerServiceOutlined />,
    label: "音乐控制",
    text: "显示曲名、歌手与同步歌词，可直接切歌和暂停。",
  },
  {
    icon: <MailOutlined />,
    label: "邮箱验证码",
    text: "新邮件验证码直接显示在岛上，一键复制。",
  },
  {
    icon: <RobotOutlined />,
    label: "AI 额度",
    text: "Codex、DeepSeek 等账户的余额与订阅额度常驻显示。",
  },
  {
    icon: <CloudOutlined />,
    label: "喝水打卡",
    text: "记录每日饮水量，进度以圆环显示在灵动岛。",
  },
  {
    icon: <BellOutlined />,
    label: "系统状态提醒",
    text: "音量、亮度、电源与蓝牙变化即时提示。",
  },
];

export function AboutSettings({ onStorage }: { onStorage: () => void }) {
  const [version, setVersion] = useState(packageVersion);
  useEffect(() => {
    if (!isTauri()) return;
    void getVersion()
      .then(setVersion)
      .catch(() => undefined);
  }, []);

  return (
    <div className="antd-stack">
      <Card>
        <div className="antd-about-head">
          <img className="antd-about-mark" src={appIcon} alt="" />
          <div className="antd-about-copy">
            <div className="antd-about-title">
              <Typography.Title level={3}>{t("灵动岛")}</Typography.Title>
              <Tag bordered={false}>v{version}</Tag>
            </div>
            <Typography.Text type="secondary">
              {t("为 Windows 桌面打造的状态提醒与快捷操作入口。")}
            </Typography.Text>
          </div>
          <Space className="antd-about-actions" wrap>
            <Button icon={<FolderOpenOutlined />} onClick={onStorage}>
              {t("查看数据目录")}
            </Button>
            <Button
              icon={<GithubOutlined />}
              href="https://github.com/dkj-duan/dynamic-Island"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </Button>
          </Space>
        </div>
        <Divider style={{ margin: "18px 0 14px" }} />
        <Descriptions
          column={{ xs: 1, sm: 1, md: 2 }}
          size="small"
          colon={false}
          items={[
            {
              key: "stack",
              label: t("技术栈"),
              children: "Tauri 2 · React 19 · Rust · Ant Design",
            },
            {
              key: "runtime",
              label: t("运行环境"),
              children: "Windows 10/11 · WebView2",
            },
            {
              key: "data",
              label: t("数据"),
              children: t("本机 SQLite，凭据使用 Windows 用户加密"),
            },
            {
              key: "repo",
              label: t("项目地址"),
              children: (
                <a
                  href="https://github.com/dkj-duan/dynamic-Island"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/dkj-duan/dynamic-Island
                </a>
              ),
            },
          ]}
        />
      </Card>

      <Section title={t("主要功能")}>
        <Row gutter={[20, 18]}>
          {aboutFeatures.map((feature) => (
            <Col xs={24} md={12} key={feature.label}>
              <div className="antd-feature">
                <span className="antd-feature-icon">{feature.icon}</span>
                <div>
                  <strong>{t(feature.label)}</strong>
                  <Typography.Text type="secondary">
                    {t(feature.text)}
                  </Typography.Text>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Section>
    </div>
  );
}
