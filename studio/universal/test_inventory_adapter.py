import unittest
from inventory_adapter import convert

class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.data={'status':'ok','devices':[
            {'id':'lamp1','name':'свет спальни','capabilities':[
                {'type':'devices.capabilities.on_off'},
                {'type':'devices.capabilities.range','parameters':{
                    'instance':'brightness','random_access':True,
                    'range':{'min':1,'max':100}}}]},
            {'id':'gate1','name':'ворота','capabilities':[]}],
            'scenarios':[{'id':'night1','name':'спокойной ночи','is_active':True}]}

    def test_device(self):
        x=convert(self.data,['lamp1'])
        self.assertTrue(x[0]['on_off'])
        self.assertEqual(x[0]['brightness']['max'],100)

    def test_scenario(self):
        self.assertEqual(convert(self.data,['night1'])[0]['kind'],'scenario')

    def test_invalid(self):
        for ids in [['gate1'],['bad'],['lamp1','lamp1'],[],['../../evil']]:
            with self.subTest(ids=ids),self.assertRaises(ValueError):
                convert(self.data,ids)

    def test_inactive(self):
        self.data['scenarios'][0]['is_active']=False
        with self.assertRaises(ValueError):convert(self.data,['night1'])

    def test_ambiguous(self):
        self.data['devices'].append({'id':'lamp2','name':'свет спальни большой','capabilities':[]})
        with self.assertRaises(ValueError):convert(self.data,['lamp1','lamp2'])

    def test_no_token(self):
        self.data['access_token']='secret'
        self.assertNotIn('secret',str(convert(self.data,['lamp1'])))

if __name__=='__main__':unittest.main()
