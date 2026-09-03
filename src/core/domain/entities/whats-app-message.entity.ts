export class WhatsAppMessage {
    from: string;
    to: string;
    type: string;
    text: TextData;
    constructor(from: string, to: string, type: string, text: string) {
        this.from = from;
        this.to = to;
        this.type = type;
        this.text = new TextData(text);
    }
}
export class TextData {
    body:string;
    preview_url: string;
    constructor(text:string, preview_url:string = ""){
        this.body = text;
        this.preview_url = preview_url;
    }
}


export class WhatsAppMessageBuilder {

    from: string;
    to: string;
    type: string;
    text: string;
    template: string;
    document?: string;
    public setFromNumber(from: string) {
        this.from = from;
        return this;
    }
    public setToNumber(to: string) {
        this.to = to;
        return this;
    }
    public setType(type: "text" | "template" | "location" | "document" = "text") {
        this.type = type;
        return this;
    }
    public setText(text: string) {
        this.text = text;
        return this;
    }

    public build() {
        return new WhatsAppMessage(this.from, this.to, this.type, this.text);
    }
}
