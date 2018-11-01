import attr from 'ember-data/attr';
import { computed } from '@ember/object';
import { belongsTo, hasMany } from 'ember-data/relationships';
import Model from 'ember-data/model';

import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { settled } from '@ember/test-helpers';
import { run } from '@ember/runloop';

const Person = Model.extend({
    name: attr('string'),
});

const Recipient = Model.extend({
    group: belongsTo('group'),
    person: belongsTo('person'),
    message: belongsTo('message'),
});

const GroupMember = Model.extend({
    roles: attr(),
    group: belongsTo('group'),
    person: belongsTo('person'),
});

const Group = Model.extend({
    groupName: attr('string'),
    groupMembers: hasMany('group-member'),
    people: computed('groupMembers.@each.roles', function () {
        const people = [];
        this.groupMembers.forEach((member) => {
            if (member.get('roles').includes('view')) {
                people.push(member.get('person'));
            }
        });

        return people;
    }),
});

const Message = Model.extend({
    title: attr('string'),
    recipients: hasMany('recipients'),
    group: belongsTo('group'),

    recipientsById: computed('recipients.[]', 'group.people.[]', function () {
        const recipients = this.recipients;
        const recipientsById = {};

        recipients.forEach((recipient) => {
            const person = recipient.get('person');
            const personId = person && person.get('id');
            if (personId) {
                recipientsById[personId] = person;
            } else {
                const group = recipient.get('group');
                group.get('people').forEach((groupPerson) => {
                    recipientsById[groupPerson.get('id')] = groupPerson;
                });
            }
        });
        return recipientsById;
    }),

    people: computed('recipientsById', function () {
        return Object.values(this.recipientsById).sortBy(name);
    }),
});

module('Unit | Model | nested-computed', function (hooks) {
    setupTest(hooks);

    hooks.beforeEach(function () {
        this.store = this.owner.lookup('service:store');
        this.owner.register('model:group', Group);
        this.owner.register('model:group-member', GroupMember);
        this.owner.register('model:recipient', Recipient);
        this.owner.register('model:person', Person);
        this.owner.register('model:message', Message);
    });

    test('message person list updates when new person added to group', async function (assert) {
        const store = run(() => this.owner.lookup('service:store').createRecord('message')).store;
        const message = run(() => {
            const group1 = store.createRecord('group', { id: 'group-1', groupName: 'group 1' });
            const person1 = store.createRecord('person', { id: 'person-1', name: 'Alice' });
            store.createRecord('group-member', {
                id: 'group-member-1',
                roles: ['view'],
                person: person1,
                group: group1,
            });
            const recipient = store.createRecord('recipient', { group: group1 });
            return store.createRecord('message', {
                id: 'message-1',
                group: group1,
                recipients: [recipient],
            });
        });
        const group = store.peekRecord('group', 'group-1');

        assert.equal(group.get('people.length'), 1, '1 person in the group');
        assert.equal(message.get('people.length'), 1, '1 person');

        run(() => {
            const group1 = store.peekRecord('group', 'group-1');
            const person2 = store.createRecord('person', { id: 'person-2', name: 'Bob' });
            store.createRecord('group-member', {
                id: 'group-member-2',
                roles: ['view'],
                person: person2,
                group: group1,
            });
        });

        await settled();

        assert.equal(group.get('people.length'), 2, '2 people in the group');

        // THIS TEST FAILS, but it used to pass in Ember/Ember Data 2.18
        assert.equal(message.get('people.length'), 2, '2 people recipients');
    });
});
