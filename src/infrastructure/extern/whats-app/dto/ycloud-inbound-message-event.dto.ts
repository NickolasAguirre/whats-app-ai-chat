export class YCloudCustomerProfile {
    name: string;
    username: string;
}

export class YCloudInboundText {
    body: string;
}

export class YCloudInboundMessage {
    id: string;
    wabaId: string;
    from: string;
    fromUserId: string;
    fromParentUserId?: string;
    customerProfile: YCloudCustomerProfile;
    to: string;
    groupId?: string;
    sendTime: string;
    type: string;
    text: YCloudInboundText;
}

export class YCloudInboundMessageEvent {
    id: string;
    type: string;
    apiVersion: string;
    createTime: string;
    whatsappInboundMessage: YCloudInboundMessage;
}
