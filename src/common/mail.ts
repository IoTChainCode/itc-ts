import * as childProcess from 'child_process';

export function sendMail(from: string, to: string, subject: string, body: string) {
    sendMailThroughUnixSendMail(from, to, subject, body);
}

function sendMailThroughUnixSendMail(from: string, to: string, subject: string, body: string) {
    const child = childProcess.spawn('/usr/sbin/sendmail', ['-t', to]);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.stdin.write(`Return-path: ${from}>
        To: ${to}
        From: ${from}
        Subject: ${subject}
        
        
        ${body}`);
    child.stdin.end();
}
