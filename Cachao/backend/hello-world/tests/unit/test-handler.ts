import { lambdaHandler } from '../../app';
import { expect } from 'chai';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';

describe('Tests index', function () {
    let event: APIGatewayProxyEvent;
    let context: Context;

    beforeEach(() => {
        event = {} as APIGatewayProxyEvent;
        context = {} as Context;
    });

    it('verifies successful response', async () => {
        const result = await lambdaHandler(event, context);

        expect(result).to.be.an('object');
        expect(result.statusCode).to.equal(200);
        expect(result.body).to.be.an('string');

        let response = JSON.parse(result.body);

        expect(response).to.be.an('object');
        expect(response.message).to.be.equal("hello world");
    });
});

